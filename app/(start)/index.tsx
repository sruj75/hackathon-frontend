import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking as NativeLinking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';
import { isSupabaseConfigured } from '@/lib/supabase';

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Google sign-in failed';
}

export default function StartScreen() {
  const router = useRouter();
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  const isBackendConfigured = Boolean(backendUrl);
  const configurationError =
    !isSupabaseConfigured || !isBackendConfigured
      ? 'App configuration is missing in this build. Please contact support.'
      : null;
  const { user, isLoading, signInWithGoogle, getAccessToken } = useAuth();
  const {
    state,
    clearError,
    resetState,
    startSetup,
    cancelSetup,
    retrySetup,
    recheckAfterForeground,
  } = useAuthBootstrap(backendUrl, getAccessToken);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      resetState();
      setAuthError(null);
    }
  }, [resetState, user]);

  useEffect(() => {
    // If session appears while OAuth promise is still settling, unblock UI.
    if (user && isSigningIn) {
      setIsSigningIn(false);
    }
  }, [isSigningIn, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && user) {
        void recheckAfterForeground();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [recheckAfterForeground, user]);

  const handleStartAgentPress = useCallback(() => {
    if (!state.ready) {
      return;
    }
    if (state.ready.route === 'assistant') {
      router.replace('/assistant');
      return;
    }

    router.replace({
      pathname: '/assistant',
      params: {
        trigger_type: 'onboarding',
        ...(state.ready.resumeSessionId
          ? { resume_session_id: state.ready.resumeSessionId }
          : {}),
      },
    });
  }, [router, state.ready]);

  const handlePrimaryPress = useCallback(async () => {
    if (configurationError || state.phase === 'ready') {
      return;
    }

    if (!user) {
      if (isSigningIn) {
        return;
      }
      const signInStartedAt = Date.now();
      setAuthError(null);
      clearError();
      setIsSigningIn(true);
      console.log('[AUTH_FLOW] sign_in_start');
      try {
        await signInWithGoogle();
        console.log(
          `[AUTH_FLOW] sign_in_success duration_ms=${
            Date.now() - signInStartedAt
          }`
        );
      } catch (error) {
        console.error('[AUTH_FLOW] sign_in_fail', error);
        setAuthError(normalizeErrorMessage(error));
      } finally {
        setIsSigningIn(false);
      }
      return;
    }

    setAuthError(null);
    clearError();
    await startSetup();
  }, [
    clearError,
    configurationError,
    isSigningIn,
    signInWithGoogle,
    startSetup,
    state.phase,
    user,
  ]);

  const handleRetryPress = useCallback(async () => {
    await retrySetup();
  }, [retrySetup]);

  const handleOpenSettings = useCallback(async () => {
    try {
      await NativeLinking.openSettings();
    } catch (error) {
      console.warn('[BOOTSTRAP_FLOW] open_settings_fail', error);
    }
  }, []);

  const setupReady = state.phase === 'ready' && Boolean(state.ready);
  const authBootstrapping = isLoading && !user;
  const isBusy = authBootstrapping || state.isBusy || isSigningIn;
  const primaryDisabled = Boolean(configurationError) || isBusy || setupReady;

  const buttonText = isSigningIn
    ? 'Signing In...'
    : !user
    ? 'Sign In With Google'
    : state.isBusy
    ? 'Running setup...'
    : setupReady
    ? 'Setup Complete'
    : 'Run setup';

  const stepText =
    configurationError ||
    (setupReady
      ? 'Setup complete. Tap below to start onboarding.'
      : !user
      ? 'Sign in with Google to begin setup.'
      : state.stepLabel ||
        'Tap Run setup to connect tools and grant permissions.');
  const stalledHint = state.isStalled
    ? 'Still working. You can wait or cancel and retry.'
    : null;
  const activeError = !configurationError ? authError || state.error : null;

  return (
    <View style={styles.container}>
      <Text style={styles.logoText}>Intentive</Text>
      <Text style={styles.subtitle}>Voice-first executive support.</Text>

      <TouchableOpacity
        onPress={handlePrimaryPress}
        style={styles.button}
        activeOpacity={0.7}
        disabled={primaryDisabled}
        testID="start-primary-button"
      >
        {isBusy ? (
          <ActivityIndicator
            size="small"
            color="#ffffff"
            style={styles.spinner}
          />
        ) : null}
        <Text style={styles.buttonText}>{buttonText}</Text>
      </TouchableOpacity>

      {state.canCancel ? (
        <TouchableOpacity
          onPress={cancelSetup}
          style={styles.secondaryButton}
          activeOpacity={0.7}
          disabled={!state.canCancel}
          testID="start-cancel-button"
        >
          <Text style={styles.secondaryButtonText}>Cancel setup</Text>
        </TouchableOpacity>
      ) : null}

      {setupReady && state.ready ? (
        <TouchableOpacity
          onPress={handleStartAgentPress}
          style={styles.secondaryButton}
          activeOpacity={0.7}
          disabled={isBusy}
          testID="start-agent-button"
        >
          <Text style={styles.secondaryButtonText}>
            {state.ready.route === 'assistant'
              ? 'Open assistant'
              : 'Start onboarding agent'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {state.canRetry && !setupReady ? (
        <TouchableOpacity
          onPress={handleRetryPress}
          style={styles.secondaryButton}
          activeOpacity={0.7}
          disabled={isBusy}
          testID="start-retry-button"
        >
          <Text style={styles.secondaryButtonText}>Retry setup</Text>
        </TouchableOpacity>
      ) : null}

      {state.errorCode === 'notification_required' ? (
        <TouchableOpacity
          onPress={handleOpenSettings}
          style={styles.secondaryButton}
          activeOpacity={0.7}
          disabled={isBusy}
          testID="start-open-settings-button"
        >
          <Text style={styles.secondaryButtonText}>Open Settings</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.progressText}>{stepText}</Text>
      {stalledHint ? (
        <Text style={styles.progressText}>{stalledHint}</Text>
      ) : null}

      {activeError ? <Text style={styles.errorText}>{activeError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#05070D',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#B8C0D6',
    marginBottom: 28,
    textAlign: 'center',
  },
  button: {
    minWidth: 230,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A45FF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryButton: {
    minWidth: 230,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#3A4868',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  spinner: {
    marginRight: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  progressText: {
    marginTop: 16,
    color: '#B8C0D6',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    color: '#FFB4B4',
    textAlign: 'center',
  },
});
