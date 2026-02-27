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

function RootLayoutNavigator() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { user } = useAuth();

  // Handle notification taps (deep linking)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;

        console.log('[RootLayout] Notification tapped with data:', data);

        // Navigate to assistant with session context if available
        if (data.session_id) {
          const triggerType =
            typeof data.trigger_type === 'string'
              ? data.trigger_type
              : (data.type as string);
          router.push({
            pathname: '/assistant',
            params: {
              resume_session_id: data.session_id as string,
              trigger_type: triggerType,
              entry_mode: (data.entry_mode as string) || 'proactive',
              source: (data.source as string) || 'push',
              event_id:
                typeof data.event_id === 'string'
                  ? (data.event_id as string)
                  : undefined,
              calendar_event_id:
                typeof data.calendar_event_id === 'string'
                  ? (data.calendar_event_id as string)
                  : undefined,
              scheduled_time:
                typeof data.scheduled_time === 'string'
                  ? (data.scheduled_time as string)
                  : undefined,
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
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen
          name="composio/callback"
          options={{ headerShown: false }}
        />
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
