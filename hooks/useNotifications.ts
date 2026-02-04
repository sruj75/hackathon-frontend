import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

/**
 * Hook to manage push notification permissions and token registration.
 *
 * Philosophy (v0):
 * - Request permissions on app launch (reliability over UX)
 * - If user denies: Accept it, feature won't work
 * - If POST fails: Accept failure, will retry on next app open
 */

interface UseNotificationsResult {
  isReady: boolean;
  hasPermission: boolean;
  token: string | null;
  error: string | null;
}

export function useNotifications(userId: string): UseNotificationsResult {
  const [isReady, setIsReady] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      return;
    }

    async function setupNotifications() {
      try {
        // 1. Check if running on physical device (push notifications don't work in simulator)
        if (!Device.isDevice) {
          console.log(
            '[useNotifications] Not a physical device, skipping push notification setup'
          );
          setIsReady(true);
          return;
        }

        // 2. Request permissions
        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('[useNotifications] Permission denied by user');
          setHasPermission(false);
          setIsReady(true);
          return;
        }

        setHasPermission(true);

        // 3. Get Expo push token
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'c4e705ec-1671-4e31-ba01-43d1bc1234c7', // From app.json
        });
        const pushToken = tokenData.data;
        setToken(pushToken);
        console.log('[useNotifications] Got push token:', pushToken);

        // 4. POST token to backend
        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          console.warn(
            '[useNotifications] EXPO_PUBLIC_BACKEND_URL not configured'
          );
          setIsReady(true);
          return;
        }

        const response = await fetch(`${backendUrl}/api/save-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            token: pushToken,
          }),
        });

        if (!response.ok) {
          // Accept failure, don't retry (v0 simplicity)
          console.warn(
            '[useNotifications] Failed to save token to backend:',
            response.status
          );
        } else {
          console.log('[useNotifications] Token saved to backend successfully');
        }

        setIsReady(true);
      } catch (err) {
        // Accept failure gracefully
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        console.error('[useNotifications] Setup error:', errorMessage);
        setError(errorMessage);
        setIsReady(true);
      }
    }

    setupNotifications();
  }, [userId]);

  return {
    isReady,
    hasPermission,
    token,
    error,
  };
}

// Configure notification behavior (how they appear when app is foregrounded)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
