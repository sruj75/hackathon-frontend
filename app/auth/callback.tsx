import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    const hasCode = typeof params.code === 'string' && params.code.length > 0;
    const error =
      typeof params.error_description === 'string'
        ? params.error_description
        : typeof params.error === 'string'
        ? params.error
        : undefined;

    console.log('[AUTH_FLOW] auth_callback', {
      has_code: hasCode,
      has_error: Boolean(error),
      error,
    });

    const timer = setTimeout(() => {
      router.replace('/');
    }, 10);
    return () => clearTimeout(timer);
  }, [params.code, params.error, params.error_description, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color="#ffffff" />
      <Text style={styles.text}>Finishing sign-in...</Text>
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
