import { useCallback, useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AudioStreamModule } from 'expo-realtime-audio';

export type BootstrapRoute = 'assistant' | 'onboarding' | 'connect_flow';

export interface BootstrapResult {
  route: Exclude<BootstrapRoute, 'connect_flow'>;
  resumeSessionId?: string;
}

export type BootstrapPhase =
  | 'idle'
  | 'running'
  | 'ready'
  | 'error'
  | 'cancelled';

export type BootstrapStep =
  | 'bootstrap_check'
  | 'tools_connect'
  | 'mic_permission'
  | 'notif_permission'
  | 'finalizing'
  | null;

export type BootstrapErrorCode =
  | 'microphone_required'
  | 'notification_required'
  | 'unknown'
  | null;

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
  links?: {
    app: string;
    redirect_url?: string | null;
  }[];
}

export interface AuthBootstrapState {
  phase: BootstrapPhase;
  step: BootstrapStep;
  stepLabel: string;
  toolsAlreadyConnected: boolean;
  progress: string;
  error: string | null;
  errorCode: BootstrapErrorCode;
  ready: BootstrapResult | null;
  isBusy: boolean;
  isStalled: boolean;
  canCancel: boolean;
  canRetry: boolean;
}

const FRIENDLY_APP_NAMES: Record<string, string> = {
  googlecalendar: 'Google Calendar',
  googletasks: 'Google Tasks',
};
const REQUIRED_COMPOSIO_APPS = ['googlecalendar', 'googletasks'] as const;
const EXPO_PROJECT_ID = 'c4e705ec-1671-4e31-ba01-43d1bc1234c7';
const STALLED_HINT_MS = 8000;
const STALE_RUN_ERROR = 'STALE_BOOTSTRAP_RUN';
const IOS_GRANTED_STATUSES = new Set<number>([
  Notifications.IosAuthorizationStatus.AUTHORIZED,
  Notifications.IosAuthorizationStatus.PROVISIONAL,
  Notifications.IosAuthorizationStatus.EPHEMERAL,
]);

class BootstrapFlowError extends Error {
  code: Exclude<BootstrapErrorCode, null>;

  constructor(code: Exclude<BootstrapErrorCode, null>, message: string) {
    super(message);
    this.name = 'BootstrapFlowError';
    this.code = code;
  }
}

function formatAppName(app: string): string {
  return FRIENDLY_APP_NAMES[app.toLowerCase()] ?? app;
}

function getMissingRequiredApps(apps: IntegrationAppStatus[]): string[] {
  const byApp = new Map(
    apps.map((app) => [app.app.toLowerCase(), app.connected === true])
  );
  return REQUIRED_COMPOSIO_APPS.filter(
    (requiredApp) => !byApp.get(requiredApp)
  );
}

async function readResponseError(response: Response): Promise<string> {
  const bodyText = await response.text().catch(() => '');
  return bodyText || `Request failed with status ${response.status}`;
}

function isBusyPhase(phase: BootstrapPhase): boolean {
  return phase === 'running';
}

function toState({
  phase,
  step = null,
  stepLabel = '',
  toolsAlreadyConnected = false,
  progress,
  error,
  errorCode,
  ready,
  isStalled = false,
}: {
  phase: BootstrapPhase;
  step?: BootstrapStep;
  stepLabel?: string;
  toolsAlreadyConnected?: boolean;
  progress: string;
  error: string | null;
  errorCode: BootstrapErrorCode;
  ready: BootstrapResult | null;
  isStalled?: boolean;
}): AuthBootstrapState {
  const busy = isBusyPhase(phase);
  return {
    phase,
    step,
    stepLabel,
    toolsAlreadyConnected,
    progress,
    error,
    errorCode,
    ready,
    isBusy: busy,
    isStalled: busy ? isStalled : false,
    canCancel: busy,
    canRetry: phase === 'error' || phase === 'cancelled',
  };
}

function normalizeErrorMessage(error: unknown): {
  message: string;
  code: Exclude<BootstrapErrorCode, null>;
} {
  if (error instanceof BootstrapFlowError) {
    return { message: error.message, code: error.code };
  }
  if (error instanceof Error && error.message) {
    return { message: error.message, code: 'unknown' };
  }
  return {
    message: 'Something went wrong while setting up your account.',
    code: 'unknown',
  };
}

function isNotificationPermissionGranted(
  permission: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>
): boolean {
  if (permission.status === 'granted') {
    return true;
  }
  const iosStatus = permission.ios?.status;
  return typeof iosStatus === 'number' && IOS_GRANTED_STATUSES.has(iosStatus);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isStaleRunError(error: unknown): boolean {
  return error instanceof Error && error.message === STALE_RUN_ERROR;
}

function logWithMeta(
  tag: 'AUTH_FLOW' | 'BOOTSTRAP_FLOW',
  event: string,
  meta: Record<string, string | number | undefined>
) {
  const suffix = Object.entries(meta)
    .filter((entry) => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[${tag}] ${event}${suffix ? ` ${suffix}` : ''}`);
}

const INITIAL_STATE = toState({
  phase: 'idle',
  progress: '',
  error: null,
  errorCode: null,
  ready: null,
});

export function useAuthBootstrap(
  backendUrl: string | undefined,
  getAccessToken: () => Promise<string | null>
) {
  const [state, setState] = useState<AuthBootstrapState>(INITIAL_STATE);
  const inFlightRef = useRef(false);
  const runIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const abortActiveRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const assertRunActive = useCallback((runId: number) => {
    if (runIdRef.current !== runId) {
      throw new Error(STALE_RUN_ERROR);
    }
  }, []);

  const markStalled = useCallback(
    (runId: number) => {
      clearStallTimer();
      stallTimerRef.current = setTimeout(() => {
        if (runIdRef.current !== runId || !inFlightRef.current) {
          return;
        }
        setState((prev) => {
          if (!prev.isBusy || prev.isStalled) {
            return prev;
          }
          return { ...prev, isStalled: true };
        });
      }, STALLED_HINT_MS);
    },
    [clearStallTimer]
  );

  const clearError = useCallback(() => {
    setState((prev) =>
      toState({
        phase:
          prev.phase === 'error' || prev.phase === 'cancelled'
            ? 'idle'
            : prev.phase,
        step:
          prev.phase === 'error' || prev.phase === 'cancelled'
            ? null
            : prev.step,
        stepLabel:
          prev.phase === 'error' || prev.phase === 'cancelled'
            ? ''
            : prev.stepLabel,
        toolsAlreadyConnected:
          prev.phase === 'error' || prev.phase === 'cancelled'
            ? false
            : prev.toolsAlreadyConnected,
        progress:
          prev.phase === 'error' || prev.phase === 'cancelled'
            ? ''
            : prev.progress,
        error: null,
        errorCode: null,
        ready: prev.phase === 'ready' ? prev.ready : null,
        isStalled: prev.isStalled,
      })
    );
  }, []);

  const resetState = useCallback(() => {
    runIdRef.current += 1;
    inFlightRef.current = false;
    abortActiveRequest();
    clearStallTimer();
    setState(INITIAL_STATE);
  }, [abortActiveRequest, clearStallTimer]);

  const fetchWithAbort = useCallback(
    async (
      runId: number,
      url: string,
      init: RequestInit
    ): Promise<Response> => {
      assertRunActive(runId);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        return await fetch(url, {
          ...init,
          signal: controller.signal,
        });
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [assertRunActive]
  );

  const fetchBootstrapState = useCallback(
    async (
      runId: number,
      accessToken: string
    ): Promise<BootstrapApiResponse> => {
      if (!backendUrl) {
        throw new BootstrapFlowError('unknown', 'Backend URL is missing');
      }
      assertRunActive(runId);

      const response = await fetchWithAbort(
        runId,
        `${backendUrl}/api/onboarding/bootstrap`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      assertRunActive(runId);
      if (!response.ok) {
        throw new BootstrapFlowError(
          'unknown',
          await readResponseError(response)
        );
      }
      return (await response.json()) as BootstrapApiResponse;
    },
    [assertRunActive, backendUrl, fetchWithAbort]
  );

  const connectMissingApps = useCallback(
    async (
      runId: number,
      accessToken: string,
      apps: string[],
      onAuthorizeApp?: (appName: string) => void
    ): Promise<void> => {
      if (!backendUrl) {
        throw new BootstrapFlowError('unknown', 'Backend URL is missing');
      }

      assertRunActive(runId);

      const callbackUrl = Linking.createURL('composio/callback');
      const connectLinkResponse = await fetchWithAbort(
        runId,
        `${backendUrl}/api/integrations/composio/connect-link`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ redirect_url: callbackUrl }),
        }
      );
      assertRunActive(runId);
      if (!connectLinkResponse.ok) {
        throw new BootstrapFlowError(
          'unknown',
          await readResponseError(connectLinkResponse)
        );
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
        assertRunActive(runId);
        const appName = formatAppName(app);
        const redirectUrl = linksByApp.get(app.toLowerCase());
        if (!redirectUrl) {
          throw new BootstrapFlowError(
            'unknown',
            `No OAuth link returned for ${appName}`
          );
        }
        onAuthorizeApp?.(appName);

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
          throw new BootstrapFlowError(
            'unknown',
            `Opened ${appName} in an external browser. Complete it there, return to the app, then tap retry.`
          );
        }

        if (authResult.type !== 'success') {
          throw new BootstrapFlowError(
            'unknown',
            `${appName} connection was cancelled. Tap retry to continue.`
          );
        }
      }
    },
    [assertRunActive, backendUrl, fetchWithAbort]
  );

  const requestMicrophonePermission = useCallback(
    async (runId: number): Promise<void> => {
      assertRunActive(runId);

      const micPermission = await AudioStreamModule.requestPermissions();
      assertRunActive(runId);
      if (!micPermission.granted) {
        throw new BootstrapFlowError(
          'microphone_required',
          'Microphone permission is required. Please allow it and tap continue.'
        );
      }
    },
    [assertRunActive]
  );

  const requestNotificationPermission = useCallback(
    async (runId: number): Promise<void> => {
      assertRunActive(runId);

      if (!Device.isDevice) {
        throw new BootstrapFlowError(
          'notification_required',
          'Notification permission is required and can only be granted on a physical device.'
        );
      }

      let finalPermission = await Notifications.getPermissionsAsync();
      assertRunActive(runId);
      if (!isNotificationPermissionGranted(finalPermission)) {
        finalPermission = await Notifications.requestPermissionsAsync();
        assertRunActive(runId);
      }

      if (!isNotificationPermissionGranted(finalPermission)) {
        throw new BootstrapFlowError(
          'notification_required',
          'Notification permission is required. Please allow it in Settings and tap continue.'
        );
      }
    },
    [assertRunActive]
  );

  const savePushTokenBestEffort = useCallback(
    async (runId: number, accessToken: string): Promise<void> => {
      if (!backendUrl) {
        return;
      }

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: EXPO_PROJECT_ID,
        });
        assertRunActive(runId);
        const saveTokenResponse = await fetchWithAbort(
          runId,
          `${backendUrl}/api/save-token`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: tokenData.data }),
          }
        );
        if (!saveTokenResponse.ok) {
          console.warn(
            '[BOOTSTRAP_FLOW] save_token_warn',
            await readResponseError(saveTokenResponse)
          );
        }
      } catch (error) {
        if (isAbortError(error) || isStaleRunError(error)) {
          throw error;
        }
        console.warn('[BOOTSTRAP_FLOW] save_token_warn', error);
      }
    },
    [assertRunActive, backendUrl, fetchWithAbort]
  );

  const startSetup = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    inFlightRef.current = true;
    const runStartedAt = Date.now();
    let currentStep: Exclude<BootstrapStep, null> = 'bootstrap_check';
    let currentStepStartedAt = runStartedAt;
    let toolsAlreadyConnected = false;

    const setRunningStep = (
      step: Exclude<BootstrapStep, null>,
      stepLabel: string
    ) => {
      if (runIdRef.current !== runId) {
        return;
      }
      currentStep = step;
      currentStepStartedAt = Date.now();
      markStalled(runId);
      setState(
        toState({
          phase: 'running',
          step,
          stepLabel,
          toolsAlreadyConnected,
          progress: stepLabel,
          error: null,
          errorCode: null,
          ready: null,
        })
      );
      logWithMeta('BOOTSTRAP_FLOW', 'setup_step_start', {
        request_id: runId,
        step,
      });
    };

    const setRunningStepLabel = (
      step: Exclude<BootstrapStep, null>,
      stepLabel: string
    ) => {
      if (runIdRef.current !== runId) {
        return;
      }
      markStalled(runId);
      setState(
        toState({
          phase: 'running',
          step,
          stepLabel,
          toolsAlreadyConnected,
          progress: stepLabel,
          error: null,
          errorCode: null,
          ready: null,
        })
      );
    };

    const markStepSuccess = (step: Exclude<BootstrapStep, null>) => {
      logWithMeta('BOOTSTRAP_FLOW', 'setup_step_success', {
        request_id: runId,
        step,
        elapsed_ms: Date.now() - currentStepStartedAt,
      });
    };

    try {
      if (!backendUrl) {
        throw new BootstrapFlowError('unknown', 'Backend URL is missing');
      }

      setRunningStep('bootstrap_check', 'Checking your account setup...');
      const accessToken = await getAccessToken();
      assertRunActive(runId);
      if (!accessToken) {
        throw new BootstrapFlowError('unknown', 'Missing auth token');
      }
      let bootstrapState = await fetchBootstrapState(runId, accessToken);
      markStepSuccess('bootstrap_check');

      logWithMeta('BOOTSTRAP_FLOW', 'tools_check_start', {
        request_id: runId,
      });
      let missingApps = getMissingRequiredApps(bootstrapState.apps);
      if (missingApps.length === 0) {
        toolsAlreadyConnected = true;
        setRunningStep(
          'tools_connect',
          'Tools already connected. Continuing...'
        );
        logWithMeta('BOOTSTRAP_FLOW', 'tools_already_connected', {
          request_id: runId,
        });
        markStepSuccess('tools_connect');
      } else {
        let connectAttempts = 0;
        while (missingApps.length > 0) {
          setRunningStep('tools_connect', 'Connecting required tools...');
          connectAttempts += 1;
          logWithMeta('BOOTSTRAP_FLOW', 'tools_connect_required', {
            request_id: runId,
            apps: missingApps.join(','),
          });

          await connectMissingApps(
            runId,
            accessToken,
            missingApps,
            (appName: string) => {
              setRunningStepLabel('tools_connect', `Authorize ${appName}...`);
            }
          );

          setRunningStepLabel('tools_connect', 'Verifying tool connections...');
          bootstrapState = await fetchBootstrapState(runId, accessToken);
          missingApps = getMissingRequiredApps(bootstrapState.apps);
          if (connectAttempts >= 3 && missingApps.length > 0) {
            throw new BootstrapFlowError(
              'unknown',
              `Required app connections are still pending (${missingApps
                .map((app) => formatAppName(app))
                .join(', ')}). Tap retry to continue.`
            );
          }
        }
        markStepSuccess('tools_connect');
      }

      if (bootstrapState.route_hint === 'connect_flow') {
        throw new BootstrapFlowError(
          'unknown',
          'Required app connections are still pending. Tap retry to continue.'
        );
      }
      if (
        bootstrapState.route_hint !== 'assistant' &&
        bootstrapState.route_hint !== 'onboarding'
      ) {
        throw new BootstrapFlowError(
          'unknown',
          `Unexpected route hint: ${bootstrapState.route_hint}`
        );
      }

      setRunningStep('mic_permission', 'Requesting microphone permission...');
      await requestMicrophonePermission(runId);
      markStepSuccess('mic_permission');

      setRunningStep(
        'notif_permission',
        'Requesting notification permission...'
      );
      await requestNotificationPermission(runId);
      markStepSuccess('notif_permission');

      setRunningStep('finalizing', 'Finalizing setup...');
      await savePushTokenBestEffort(runId, accessToken);
      markStepSuccess('finalizing');
      assertRunActive(runId);

      const readyResult: BootstrapResult = {
        route: bootstrapState.route_hint,
        ...(bootstrapState.onboarding_session_id
          ? { resumeSessionId: bootstrapState.onboarding_session_id }
          : {}),
      };

      logWithMeta('BOOTSTRAP_FLOW', 'ready', {
        request_id: runId,
        phase: 'ready',
        route: readyResult.route,
        elapsed_ms: Date.now() - runStartedAt,
      });
      setState(
        toState({
          phase: 'ready',
          step: null,
          stepLabel: '',
          toolsAlreadyConnected,
          progress: 'Setup complete. Tap below to continue.',
          error: null,
          errorCode: null,
          ready: readyResult,
        })
      );
    } catch (error) {
      if (isStaleRunError(error)) {
        return;
      }
      if (isAbortError(error)) {
        return;
      }

      const normalized = normalizeErrorMessage(error);
      logWithMeta('BOOTSTRAP_FLOW', 'setup_step_error', {
        request_id: runId,
        step: currentStep,
        elapsed_ms: Date.now() - currentStepStartedAt,
        reason: normalized.code,
      });
      logWithMeta('BOOTSTRAP_FLOW', 'fail', {
        request_id: runId,
        phase: 'error',
        elapsed_ms: Date.now() - runStartedAt,
        code: normalized.code,
      });
      if (runIdRef.current !== runId) {
        return;
      }
      setState(
        toState({
          phase: 'error',
          step: currentStep,
          stepLabel: '',
          toolsAlreadyConnected,
          progress: '',
          error: normalized.message,
          errorCode: normalized.code,
          ready: null,
        })
      );
    } finally {
      if (runIdRef.current === runId) {
        inFlightRef.current = false;
        clearStallTimer();
      }
    }
  }, [
    assertRunActive,
    backendUrl,
    clearStallTimer,
    connectMissingApps,
    fetchBootstrapState,
    getAccessToken,
    markStalled,
    requestMicrophonePermission,
    requestNotificationPermission,
    savePushTokenBestEffort,
  ]);

  const cancelSetup = useCallback(() => {
    if (!inFlightRef.current) {
      return;
    }
    const cancelledRunId = runIdRef.current;
    runIdRef.current += 1;
    inFlightRef.current = false;
    clearStallTimer();
    abortActiveRequest();
    logWithMeta('BOOTSTRAP_FLOW', 'cancel', {
      request_id: cancelledRunId,
      phase: 'cancelled',
    });
    setState(
      toState({
        phase: 'cancelled',
        progress: 'Setup cancelled. Tap retry to continue.',
        error: null,
        errorCode: null,
        ready: null,
      })
    );
  }, [abortActiveRequest, clearStallTimer]);

  const retrySetup = useCallback(async (): Promise<void> => {
    clearError();
    await startSetup();
  }, [clearError, startSetup]);

  const recheckAfterForeground = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      return;
    }
    if (
      (state.phase !== 'error' && state.phase !== 'cancelled') ||
      state.errorCode !== 'notification_required'
    ) {
      return;
    }

    const permission = await Notifications.getPermissionsAsync();
    if (!isNotificationPermissionGranted(permission)) {
      return;
    }

    logWithMeta('BOOTSTRAP_FLOW', 'notif_recheck_granted', {
      phase: state.phase,
    });
    await retrySetup();
  }, [retrySetup, state.errorCode, state.phase]);

  useEffect(() => {
    return () => {
      clearStallTimer();
      abortActiveRequest();
      inFlightRef.current = false;
    };
  }, [abortActiveRequest, clearStallTimer]);

  return {
    state,
    clearError,
    resetState,
    startSetup,
    cancelSetup,
    retrySetup,
    recheckAfterForeground,
  };
}
