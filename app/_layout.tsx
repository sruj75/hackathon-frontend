import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { setupNotificationHandler } from '@/hooks/useNotifications';

// Set up notification handler at app startup
setupNotificationHandler();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const notificationResponseListener =
    useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Handle notification taps (deep linking)
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log(
          '🔔 Notification tapped:',
          response.notification.request.content
        );

        // Navigate to assistant screen when notification is tapped
        router.push('/assistant');
      });

    // Cleanup
    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
    };
  }, [router]);

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
