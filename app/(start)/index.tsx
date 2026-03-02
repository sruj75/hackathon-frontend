import { useCallback } from 'react';
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

  const runBootstrapAndRoute = useCallback(async () => {
    const result = await runBootstrap();
    if (!result) {
      return;
    }
    if (result.route === 'assistant') {
      router.replace('/assistant');
      return;
    }
    if (result.route === 'onboarding') {
      const params: Record<string, string> = {
        trigger_type: 'onboarding',
      };
      if (result.onboardingSessionId) {
        params.resume_session_id = result.onboardingSessionId;
      }

      router.replace({
        pathname: '/assistant',
        params,
      });
    }
  }, [router, runBootstrap]);

  const handlePrimaryPress = useCallback(async () => {
    clearError();

    if (!user) {
      setSigningIn();
      try {
        await signInWithGoogle();
      } catch (error) {
        setError(normalizeErrorMessage(error));
      }
      return;
    }

    await runBootstrapAndRoute();
  }, [
    clearError,
    runBootstrapAndRoute,
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
    state.phase === 'verifying' ||
    state.phase === 'routing';

  const buttonText = !user
    ? state.phase === 'signing_in'
      ? 'Signing In...'
      : 'Sign In With Google'
    : isBusy
    ? 'Setting Up...'
    : 'Continue';

  const progressText =
    configurationError ||
    state.progress ||
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
        disabled={isBusy}
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
