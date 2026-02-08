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
import { useNotifications } from '@/hooks/useNotifications';
import { getSingleUserId } from '@/constants/user';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const userId = getSingleUserId();

  // Setup push notifications
  useNotifications(userId ?? '');

  // Handle notification taps (deep linking)
  useEffect(() => {
    if (!userId) {
      console.error(
        '[RootLayout] EXPO_PUBLIC_SINGLE_USER_ID not configured; notifications are disabled'
      );
    }
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
  }, [router, userId]);

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
