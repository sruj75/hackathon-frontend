import { renderHook, waitFor } from '@testing-library/react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { useNotifications } from '@/hooks/useNotifications';

jest.mock('expo-notifications');
jest.mock('expo-device');

global.fetch = jest.fn();

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Device.isDevice as any) = true;
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
  });

  it('requests permission, gets token, and posts with bearer auth', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const { result } = renderHook(() =>
      useNotifications(async () => 'jwt_test_token')
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/save-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt_test_token',
        }),
      })
    );
  });

  it('does not post when access token is missing', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });

    const { result } = renderHook(() => useNotifications(async () => null));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.error).toBe('missing_access_token');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
