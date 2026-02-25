import { useCallback, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

export type BootstrapRoute =
  | 'assistant'
  | 'onboarding_placeholder'
  | 'connect_flow';

export type BootstrapPhase =
  | 'idle'
  | 'signing_in'
  | 'connecting_tools'
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

function formatAppName(app: string): string {
  return FRIENDLY_APP_NAMES[app.toLowerCase()] ?? app;
}

async function readResponseError(response: Response): Promise<string> {
  const bodyText = await response.text().catch(() => '');
  return bodyText || `Request failed with status ${response.status}`;
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
      setState({
        phase: 'verifying',
        progress: 'Checking your account setup...',
        error: null,
      });

      const response = await fetch(`${backendUrl}/api/onboarding/bootstrap`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(await readResponseError(response));
      }
      return (await response.json()) as BootstrapApiResponse;
    },
    [backendUrl]
  );

  const connectMissingApps = useCallback(
    async (accessToken: string, apps: string[]): Promise<void> => {
      if (!backendUrl) {
        throw new Error('Backend URL is missing');
      }

      const callbackUrl = Linking.createURL('composio/callback');
      setState({
        phase: 'connecting_tools',
        progress: 'Preparing app connections...',
        error: null,
      });

      const connectLinkResponse = await fetch(
        `${backendUrl}/api/integrations/composio/connect-link`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ redirect_url: callbackUrl }),
        }
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
    },
    [backendUrl]
  );

  const runBootstrap = useCallback(async (): Promise<BootstrapRoute | null> => {
    if (inFlightRef.current) {
      return null;
    }

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

      setState({
        phase: 'routing',
        progress: 'Opening your workspace...',
        error: null,
      });

      if (
        bootstrapState.route_hint !== 'assistant' &&
        bootstrapState.route_hint !== 'onboarding_placeholder'
      ) {
        throw new Error(`Unexpected route hint: ${bootstrapState.route_hint}`);
      }

      return bootstrapState.route_hint;
    } catch (error) {
      setState({
        phase: 'error',
        progress: '',
        error: normalizeErrorMessage(error),
      });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, [backendUrl, connectMissingApps, fetchBootstrapState, getAccessToken]);

  return {
    state,
    setSigningIn,
    setError,
    clearError,
    runBootstrap,
  };
}
