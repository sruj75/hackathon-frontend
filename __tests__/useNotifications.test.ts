import { renderHook, waitFor } from '@testing-library/react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { useNotifications } from '@/hooks/useNotifications';

jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

(global as any).fetch = jest.fn();

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Device as any).isDevice = true;
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
    (global.fetch as jest.Mock).mockReset();
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

    expect(result.current.hasPermission).toBe(true);
    expect(result.current.token).toBe('ExponentPushToken[test123]');
    expect(result.current.error).toBeNull();
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

  it('requests permission when not already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[after-request]',
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const { result } = renderHook(() =>
      useNotifications(async () => 'jwt_after_request')
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.hasPermission).toBe(true);
  });

  it('stops early when permission remains denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });

    const { result } = renderHook(() =>
      useNotifications(async () => 'jwt_not_used')
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.hasPermission).toBe(false);
    expect(result.current.token).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
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

  it('surfaces missing backend URL and skips fetch', async () => {
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });

    const { result } = renderHook(() =>
      useNotifications(async () => 'jwt_test_token')
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.error).toBe('missing_backend_url');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('captures backend save-token failures', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    const { result } = renderHook(() =>
      useNotifications(async () => 'jwt_test_token')
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.error).toBe('save_token_failed_503');
  });

  it('surfaces thrown setup errors', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValue(
      new Error('permission_crash')
    );

    const { result } = renderHook(() =>
      useNotifications(async () => 'jwt_test_token')
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.error).toBe('permission_crash');
  });

  it('marks setup ready immediately on simulator', async () => {
    (Device as any).isDevice = false;

    const { result } = renderHook(() =>
      useNotifications(async () => 'jwt_not_used')
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.hasPermission).toBe(false);
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
