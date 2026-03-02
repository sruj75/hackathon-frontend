import { useCallback, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AudioStreamModule } from 'expo-realtime-audio';

export type BootstrapRoute =
  | 'assistant'
  | 'onboarding'
  | 'connect_flow';

export interface BootstrapResult {
  route: Exclude<BootstrapRoute, 'connect_flow'>;
  onboardingSessionId: string | null;
}

export type BootstrapPhase =
  | 'idle'
  | 'signing_in'
  | 'connecting_tools'
  | 'requesting_permissions'
  | 'verifying'
  | 'routing'
  | 'error';

interface IntegrationAppStatus {
  app: string;
  connected: boolean;
  status: string;
  connected_account_id?: string | null;
}

interface BootstrapApiResponse {
  status: string;
  apps: IntegrationAppStatus[];
  all_connected: boolean;
  onboarding_status: 'pending' | 'completed';
  route_hint: BootstrapRoute;
  onboarding_session_id?: string;
}

interface ConnectLinkResponse {
  status: string;
  links?: Array<{
    app: string;
    redirect_url?: string | null;
  }>;
}

interface AuthBootstrapState {
  phase: BootstrapPhase;
  progress: string;
  error: string | null;
}

const FRIENDLY_APP_NAMES: Record<string, string> = {
  googlecalendar: 'Google Calendar',
  googletasks: 'Google Tasks',
};
const EXPO_PROJECT_ID = 'c4e705ec-1671-4e31-ba01-43d1bc1234c7';
const REQUEST_TIMEOUT_MS = 20000;

function formatAppName(app: string): string {
  return FRIENDLY_APP_NAMES[app.toLowerCase()] ?? app;
}

async function readResponseError(response: Response): Promise<string> {
  const bodyText = await response.text().catch(() => '');
  return bodyText || `Request failed with status ${response.status}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMessage: string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong while setting up your account.';
}

export function useAuthBootstrap(
  backendUrl: string | undefined,
  getAccessToken: () => Promise<string | null>
) {
  const [state, setState] = useState<AuthBootstrapState>({
    phase: 'idle',
    progress: '',
    error: null,
  });
  const inFlightRef = useRef(false);
  const permissionsPreparedRef = useRef(false);

  const setSigningIn = useCallback(() => {
    setState({
      phase: 'signing_in',
      progress: 'Signing you in...',
      error: null,
    });
  }, []);

  const setError = useCallback((message: string) => {
    setState({ phase: 'error', progress: '', error: message });
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({
      phase: prev.phase === 'error' ? 'idle' : prev.phase,
      progress: prev.phase === 'error' ? '' : prev.progress,
      error: null,
    }));
  }, []);

  const fetchBootstrapState = useCallback(
    async (accessToken: string): Promise<BootstrapApiResponse> => {
      if (!backendUrl) {
        throw new Error('Backend URL is missing');
      }
      const verifyStartedAt = Date.now();
      console.log('[BOOTSTRAP_FLOW] verify_start');
      setState({
        phase: 'verifying',
        progress: 'Checking your account setup...',
        error: null,
      });

      try {
        const response = await fetchWithTimeout(
          `${backendUrl}/api/onboarding/bootstrap`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
          'Timed out while checking your account setup. Please tap retry.'
        );
        if (!response.ok) {
          throw new Error(await readResponseError(response));
        }
        console.log(
          `[BOOTSTRAP_FLOW] verify_success duration_ms=${Date.now() - verifyStartedAt}`
        );
        return (await response.json()) as BootstrapApiResponse;
      } catch (error) {
        console.error('[BOOTSTRAP_FLOW] verify_fail', error);
        throw error;
      }
    },
    [backendUrl]
  );

  const connectMissingApps = useCallback(
    async (accessToken: string, apps: string[]): Promise<void> => {
      if (!backendUrl) {
        throw new Error('Backend URL is missing');
      }

      const connectStartedAt = Date.now();
      console.log(
        `[BOOTSTRAP_FLOW] connect_start apps=${apps.map((app) => app.toLowerCase()).join(',')}`
      );
      const callbackUrl = Linking.createURL('composio/callback');
      setState({
        phase: 'connecting_tools',
        progress: 'Preparing app connections...',
        error: null,
      });

      try {
        const connectLinkResponse = await fetchWithTimeout(
          `${backendUrl}/api/integrations/composio/connect-link`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ redirect_url: callbackUrl }),
          },
          'Timed out while preparing app connections. Please tap retry.'
        );

        if (!connectLinkResponse.ok) {
          throw new Error(await readResponseError(connectLinkResponse));
        }

        const connectBody =
          (await connectLinkResponse.json()) as ConnectLinkResponse;
        const linksByApp = new Map(
          (connectBody.links ?? []).map((item) => [
            item.app.toLowerCase(),
            item.redirect_url,
          ])
        );

        for (const app of apps) {
          const appName = formatAppName(app);
          const redirectUrl = linksByApp.get(app.toLowerCase());
          if (!redirectUrl) {
            throw new Error(`No OAuth link returned for ${appName}`);
          }

          setState({
            phase: 'connecting_tools',
            progress: `Authorize ${appName}...`,
            error: null,
          });

          let authResult:
            | Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>
            | undefined;
          try {
            authResult = await WebBrowser.openAuthSessionAsync(
              redirectUrl,
              callbackUrl
            );
          } catch {
            await Linking.openURL(redirectUrl);
            throw new Error(
              `Opened ${appName} in an external browser. Complete it there, return to the app, then tap retry.`
            );
          }

          if (authResult.type !== 'success') {
            throw new Error(
              `${appName} connection was cancelled. Tap retry to continue.`
            );
          }
        }
        console.log(
          `[BOOTSTRAP_FLOW] connect_success duration_ms=${Date.now() - connectStartedAt}`
        );
      } catch (error) {
        console.error('[BOOTSTRAP_FLOW] connect_fail', error);
        throw error;
      }
    },
    [backendUrl]
  );

  const requestRequiredPermissions = useCallback(
    async (accessToken: string): Promise<void> => {
      if (permissionsPreparedRef.current) {
        return;
      }
      const permissionsStartedAt = Date.now();
      console.log('[BOOTSTRAP_FLOW] permissions_start');

      setState({
        phase: 'requesting_permissions',
        progress: 'Requesting microphone permission...',
        error: null,
      });

      const micPermission = await AudioStreamModule.requestPermissions();
      if (!micPermission.granted) {
        console.error('[BOOTSTRAP_FLOW] permissions_fail microphone_denied');
        throw new Error(
          'Microphone permission is required. Please allow it and tap continue.'
        );
      }

      if (Device.isDevice) {
        try {
          setState({
            phase: 'requesting_permissions',
            progress: 'Requesting notification permission...',
            error: null,
          });

          const { status: existingStatus } =
            await Notifications.getPermissionsAsync();
          let finalStatus = existingStatus;

          if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
          }

          if (finalStatus !== 'granted') {
            console.error('[BOOTSTRAP_FLOW] permissions_fail notifications_denied');
            throw new Error(
              'Notification permission is required. Please allow it and tap continue.'
            );
          }

          if (finalStatus === 'granted' && backendUrl) {
            setState({
              phase: 'requesting_permissions',
              progress: 'Registering notifications...',
              error: null,
            });

            const tokenData = await Notifications.getExpoPushTokenAsync({
              projectId: EXPO_PROJECT_ID,
            });
            const saveTokenResponse = await fetchWithTimeout(
              `${backendUrl}/api/save-token`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ token: tokenData.data }),
              },
              'Timed out while registering notifications. Please tap retry.'
            );
            if (!saveTokenResponse.ok) {
              console.warn(
                '[BOOTSTRAP_FLOW] permissions_warn push_token_save_failed status=',
                saveTokenResponse.status
              );
            }
          }
        } catch (notificationError) {
          console.error('[BOOTSTRAP_FLOW] permissions_fail', notificationError);
          throw notificationError;
        }
      }

      permissionsPreparedRef.current = true;
      console.log(
        `[BOOTSTRAP_FLOW] permissions_success duration_ms=${
          Date.now() - permissionsStartedAt
        }`
      );
    },
    [backendUrl]
  );

  const runBootstrap = useCallback(async (): Promise<BootstrapResult | null> => {
    if (inFlightRef.current) {
      return null;
    }

    const runStartedAt = Date.now();
    inFlightRef.current = true;
    try {
      if (!backendUrl) {
        throw new Error('Backend URL is missing');
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Missing auth token');
      }

      let bootstrapState = await fetchBootstrapState(accessToken);
      while (bootstrapState.route_hint === 'connect_flow') {
        const missingApps = bootstrapState.apps
          .filter((app) => !app.connected)
          .map((app) => app.app);

        if (missingApps.length === 0) {
          break;
        }

        await connectMissingApps(accessToken, missingApps);
        bootstrapState = await fetchBootstrapState(accessToken);
      }

      if (bootstrapState.route_hint === 'connect_flow') {
        throw new Error(
          'Required app connections are still pending. Tap retry to continue.'
        );
      }

      await requestRequiredPermissions(accessToken);

      setState({
        phase: 'routing',
        progress: 'Setup complete. Ready to start onboarding.',
        error: null,
      });

      if (
        bootstrapState.route_hint !== 'assistant' &&
        bootstrapState.route_hint !== 'onboarding'
      ) {
        throw new Error(`Unexpected route hint: ${bootstrapState.route_hint}`);
      }

      const result = {
        route: bootstrapState.route_hint,
        onboardingSessionId: bootstrapState.onboarding_session_id ?? null,
      };
      console.log(
        `[BOOTSTRAP_FLOW] success route=${result.route} duration_ms=${
          Date.now() - runStartedAt
        }`
      );
      return result;
    } catch (error) {
      console.error('[BOOTSTRAP_FLOW] fail', error);
      setState({
        phase: 'error',
        progress: '',
        error: normalizeErrorMessage(error),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [
    backendUrl,
    connectMissingApps,
    fetchBootstrapState,
    getAccessToken,
    requestRequiredPermissions,
  ]);

  return {
    state,
    setSigningIn,
    setError,
    clearError,
    runBootstrap,
  };
}
