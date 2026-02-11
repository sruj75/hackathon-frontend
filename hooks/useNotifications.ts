import { useEffect, useState, useRef } from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

interface UseNotificationsResult {
  isReady: boolean;
  hasPermission: boolean;
  token: string | null;
  error: string | null;
}

type AccessTokenResolver = () => Promise<string | null>;

export function useNotifications(
  getAccessToken: AccessTokenResolver
): UseNotificationsResult {
  const getAccessTokenRef = useRef(getAccessToken);
  getAccessTokenRef.current = getAccessToken;
  const [isReady, setIsReady] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function setupNotifications() {
      try {
        if (!Device.isDevice) {
          setIsReady(true);
          return;
        }

        const { status: existingStatus } =
          await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          setHasPermission(false);
          setIsReady(true);
          return;
        }

        setHasPermission(true);

        const accessToken = await getAccessTokenRef.current();
        if (!accessToken) {
          setError('missing_access_token');
          setIsReady(true);
          return;
        }
        setHasPermission(true);

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: 'c4e705ec-1671-4e31-ba01-43d1bc1234c7',
        });
        const pushToken = tokenData.data;
        setToken(pushToken);

        const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          setError('missing_backend_url');
          setIsReady(true);
          return;
        }

        const response = await fetch(`${backendUrl}/api/save-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ token: pushToken }),
        });
        if (!response.ok) {
          setError(`save_token_failed_${response.status}`);
        }
        setIsReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        setIsReady(true);
      }
    }

    setupNotifications();
  }, []); // Run once on mount

  return { isReady, hasPermission, token, error };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
