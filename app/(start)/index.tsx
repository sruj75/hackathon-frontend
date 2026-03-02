import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  const { state, setSigningIn, setError, clearError, runBootstrap } =
    useAuthBootstrap(backendUrl, getAccessToken);
  const [readyRoute, setReadyRoute] = useState<'assistant' | 'onboarding' | null>(
    null
  );
  const [readyParams, setReadyParams] = useState<Record<string, string> | null>(
    null
  );

  useEffect(() => {
    if (!user) {
      setReadyRoute(null);
      setReadyParams(null);
    }
  }, [user]);

  const runBootstrapSetup = useCallback(async () => {
    const startedAt = Date.now();
    console.log('[BOOTSTRAP_FLOW] setup_start');
    const result = await runBootstrap();
    if (!result) {
      console.warn('[BOOTSTRAP_FLOW] setup_fail');
      setReadyRoute(null);
      setReadyParams(null);
      return;
    }
    const nextParams =
      result.route === 'onboarding'
        ? {
            trigger_type: 'onboarding',
            ...(result.onboardingSessionId
              ? { resume_session_id: result.onboardingSessionId }
              : {}),
          }
        : null;
    setReadyRoute(result.route);
    setReadyParams(nextParams);
    console.log(
      `[BOOTSTRAP_FLOW] setup_success route=${result.route} duration_ms=${
        Date.now() - startedAt
      }`
    );
  }, [runBootstrap]);

  const handleStartAgentPress = useCallback(() => {
    if (!readyRoute) {
      return;
    }
    if (readyRoute === 'assistant') {
      router.replace('/assistant');
      return;
    }
    if (readyRoute === 'onboarding') {
      router.replace({
        pathname: '/assistant',
        params: readyParams ?? { trigger_type: 'onboarding' },
      });
    }
  }, [readyParams, readyRoute, router]);

  const handlePrimaryPress = useCallback(async () => {
    if (readyRoute) {
      return;
    }
    clearError();

    if (!user) {
      const signInStartedAt = Date.now();
      setSigningIn();
      console.log('[AUTH_FLOW] sign_in_start');
      try {
        await signInWithGoogle();
        console.log(
          `[AUTH_FLOW] sign_in_success duration_ms=${Date.now() - signInStartedAt}`
        );
        await runBootstrapSetup();
      } catch (error) {
        console.error('[AUTH_FLOW] sign_in_fail', error);
        setReadyRoute(null);
        setReadyParams(null);
        setError(normalizeErrorMessage(error));
      }
      return;
    }

    await runBootstrapSetup();
  }, [
    clearError,
    readyRoute,
    runBootstrapSetup,
    setError,
    setSigningIn,
    signInWithGoogle,
    user,
  ]);

  const isBusy =
    isLoading ||
    Boolean(configurationError) ||
    state.phase === 'signing_in' ||
    state.phase === 'connecting_tools' ||
    state.phase === 'requesting_permissions' ||
    state.phase === 'verifying' ||
    state.phase === 'routing';

  const setupReady = Boolean(readyRoute);
  const buttonText = !user
    ? state.phase === 'signing_in'
      ? 'Signing In...'
      : 'Sign In With Google'
    : isBusy
    ? 'Setting Up...'
    : setupReady
    ? 'Setup Complete'
    : 'Continue';

  const progressText =
    configurationError ||
    state.progress ||
    (setupReady
      ? 'Setup complete. Tap below to start onboarding.'
      : null) ||
    (!user
      ? 'Sign in with Google to begin setup.'
      : 'Continue to connect tools, grant permissions, and start onboarding.');

  return (
    <View style={styles.container}>
      <Text style={styles.logoText}>Intentive</Text>
      <Text style={styles.subtitle}>Voice-first executive support.</Text>

      <TouchableOpacity
        onPress={handlePrimaryPress}
        style={styles.button}
        activeOpacity={0.7}
        disabled={isBusy || setupReady}
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

      {setupReady ? (
        <TouchableOpacity
          onPress={handleStartAgentPress}
          style={styles.secondaryButton}
          activeOpacity={0.7}
          disabled={isBusy}
          testID="start-agent-button"
        >
          <Text style={styles.secondaryButtonText}>
            {readyRoute === 'assistant' ? 'Open assistant' : 'Start onboarding agent'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.progressText}>{progressText}</Text>

      {state.error && !configurationError ? (
        <Text style={styles.errorText}>{state.error}</Text>
      ) : null}
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
