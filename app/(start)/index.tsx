import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Linking,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export default function StartScreen() {
  const router = useRouter();
  const [isConnecting, setConnecting] = useState(false);
  const [wakeTime, setWakeTime] = useState('');
  const [bedtime, setBedtime] = useState('');
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  const { user, isLoading, signInWithGoogle, getAccessToken } = useAuth();

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return '';
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    setIsLoadingPrefs(true);
    if (!user) {
      setWakeTime('');
      setBedtime('');
      setIsLoadingPrefs(false);
      setErrorMessage(null);
      return;
    }
    if (!backendUrl) {
      setErrorMessage('Backend URL is missing');
      setIsLoadingPrefs(false);
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setErrorMessage('Missing auth token');
      setIsLoadingPrefs(false);
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/preferences/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        setErrorMessage(`Failed to load preferences (${response.status})`);
        setIsLoadingPrefs(false);
        return;
      }

      const data = await response.json();
      const preferences = data?.preferences;
      setWakeTime(
        typeof preferences?.wake_time === 'string' ? preferences.wake_time : ''
      );
      setBedtime(
        typeof preferences?.bedtime === 'string' ? preferences.bedtime : ''
      );
      setErrorMessage(null);
    } catch (error) {
      console.error('[StartScreen] Failed to load preferences:', error);
      setErrorMessage('Failed to load preferences');
    } finally {
      setIsLoadingPrefs(false);
    }
  }, [backendUrl, getAccessToken, user]);

  useFocusEffect(
    useCallback(() => {
      loadPreferences();
    }, [loadPreferences])
  );

  const validateInputs = () => {
    if (!TIME_PATTERN.test(wakeTime)) {
      setErrorMessage('Wake time must be HH:MM (24-hour)');
      return false;
    }
    if (!TIME_PATTERN.test(bedtime)) {
      setErrorMessage('Bedtime must be HH:MM (24-hour)');
      return false;
    }
    if (!timezone) {
      setErrorMessage('Could not detect timezone on device');
      return false;
    }
    return true;
  };

  const handleConnect = async () => {
    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Google sign-in failed'
        );
      }
      return;
    }

    setConnecting(true);
    setErrorMessage(null);

    // Check if backend URL is configured
    if (!backendUrl) {
      console.error('EXPO_PUBLIC_BACKEND_URL not configured');
      setErrorMessage('Backend URL is missing');
      setConnecting(false);
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setErrorMessage('Missing auth token');
      setConnecting(false);
      return;
    }

    if (!validateInputs()) {
      setConnecting(false);
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/preferences/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          wake_time: wakeTime,
          bedtime: bedtime,
          timezone,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        setErrorMessage(
          `Could not save preferences (${response.status}): ${errorBody}`
        );
        setConnecting(false);
        return;
      }

      const responseBody = await response
        .json()
        .catch(() => ({ status: 'unknown', scheduler: null }));
      const schedulerResynced = responseBody?.scheduler?.resynced;
      if (
        responseBody?.status === 'partial_success' ||
        schedulerResynced === false
      ) {
        const schedulerError =
          responseBody?.scheduler?.error || 'scheduler sync failed';
        setErrorMessage(
          `Preferences saved, but alarm scheduling failed: ${schedulerError}`
        );
        setConnecting(false);
        return;
      }
    } catch (error) {
      console.error('[StartScreen] Failed to save preferences:', error);
      setErrorMessage('Could not save preferences');
      setConnecting(false);
      return;
    }

    // Navigate to assistant screen - connection happens there
    setTimeout(() => {
      setConnecting(false);
      router.navigate('../assistant');
    }, 500);
  };

  const handleConnectGoogle = async () => {
    if (!user) {
      setErrorMessage('Sign in first');
      return;
    }
    if (!backendUrl) {
      setErrorMessage('Backend URL is missing');
      return;
    }
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setErrorMessage('Missing auth token');
      return;
    }

    setIsConnectingGoogle(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `${backendUrl}/api/integrations/composio/connect-link`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) {
        setErrorMessage(`Failed to create connect link (${response.status})`);
        setIsConnectingGoogle(false);
        return;
      }

      const body = await response.json();
      const firstLink =
        Array.isArray(body?.links) && body.links.length > 0
          ? body.links[0]
          : null;
      if (!firstLink?.redirect_url) {
        setErrorMessage('No Composio OAuth redirect link returned');
        setIsConnectingGoogle(false);
        return;
      }

      await Linking.openURL(firstLink.redirect_url);
      setErrorMessage(
        'Complete Google auth in browser, then return and repeat if needed for remaining apps.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to open Google OAuth'
      );
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const connectText = !user
    ? 'Sign In With Google'
    : isConnecting
    ? 'Connecting'
    : 'Start Conversation';

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Intentive</Text>

      <TouchableOpacity
        onPress={handleConnect}
        style={styles.button}
        activeOpacity={0.7}
        disabled={isConnecting || isLoadingPrefs || isLoading}
      >
        {isConnecting ? (
          <ActivityIndicator
            size="small"
            color="#ffffff"
            style={styles.activityIndicator}
          />
        ) : undefined}

        <Text style={styles.buttonText}>{connectText}</Text>
      </TouchableOpacity>
      {user ? (
        <TouchableOpacity
          onPress={handleConnectGoogle}
          style={styles.secondaryButton}
          activeOpacity={0.7}
          disabled={isConnectingGoogle}
        >
          <Text style={styles.buttonText}>
            {isConnectingGoogle
              ? 'Opening Google Connect...'
              : 'Connect Google Tools'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.preferencesCard}>
        <Text style={styles.preferencesTitle}>Daily Preferences</Text>
        {!user ? (
          <Text style={styles.inputLabel}>
            Sign in first, then set wake time, bedtime, and timezone.
          </Text>
        ) : null}

        <Text style={styles.inputLabel}>Set your alarm (wake time)</Text>
        <TextInput
          style={styles.input}
          placeholder="HH:MM"
          placeholderTextColor="#999999"
          value={wakeTime}
          onChangeText={setWakeTime}
          editable={!isConnecting && !isLoadingPrefs && !!user}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.inputLabel}>Set your bedtime</Text>
        <TextInput
          style={styles.input}
          placeholder="HH:MM"
          placeholderTextColor="#999999"
          value={bedtime}
          onChangeText={setBedtime}
          editable={!isConnecting && !isLoadingPrefs && !!user}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 59,
    height: 56,
    marginBottom: 16,
  },
  text: {
    color: '#ffffff',
    marginBottom: 24,
  },
  preferencesCard: {
    width: '88%',
    maxWidth: 360,
    marginTop: 20,
    borderRadius: 12,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  preferencesTitle: {
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 8,
  },
  inputLabel: {
    color: '#f0f0f0',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  activityIndicator: {
    marginEnd: 8,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#002CF2',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  secondaryButton: {
    flexDirection: 'row',
    backgroundColor: '#1E7B34',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
    marginTop: 12,
  },
  buttonText: {
    color: '#ffffff',
  },
  errorText: {
    color: '#ffb4b4',
    marginTop: 12,
    width: '88%',
    maxWidth: 360,
  },
});
