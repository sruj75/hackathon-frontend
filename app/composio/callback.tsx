import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function ComposioCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    status?: string;
    error?: string;
    app?: string;
  }>();

  useEffect(() => {
    const status =
      typeof params.status === 'string' ? params.status : 'unknown';
    const error = typeof params.error === 'string' ? params.error : undefined;
    const app = typeof params.app === 'string' ? params.app : undefined;
    console.log('[BOOTSTRAP_FLOW] composio_callback', {
      status,
      app,
      has_error: Boolean(error),
      error,
    });

    const timer = setTimeout(() => {
      router.replace('/');
    }, 10);
    return () => clearTimeout(timer);
  }, [params.app, params.error, params.status, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#ffffff" />
      <Text style={styles.text}>Finishing app connection...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05070D',
  },
  text: {
    color: '#B8C0D6',
    marginTop: 10,
  },
});
