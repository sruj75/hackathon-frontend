import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';

function RootLayoutNavigator() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { getAccessToken, user } = useAuth();

  // Setup push notifications
  useNotifications(getAccessToken);

  // Handle notification taps (deep linking)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;

        console.log('[RootLayout] Notification tapped with data:', data);

        // Navigate to assistant with session context if available
        if (data.session_id) {
          router.push({
            pathname: '/assistant',
            params: {
              resume_session_id: data.session_id as string,
              trigger_type: data.type as string,
            },
          });
        } else {
          // No session context - just open assistant
          router.push('/assistant');
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [router, user]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(start)" options={{ headerShown: false }} />
        <Stack.Screen name="assistant" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNavigator />
    </AuthProvider>
  );
}
