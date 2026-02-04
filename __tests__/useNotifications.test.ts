/**
 * Unit tests for useNotifications hook
 *
 * Tests:
 * - Verify permission request flow
 * - Verify token POST to backend
 * - Verify graceful failure handling
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useNotifications } from '../hooks/useNotifications';

// Mock modules
jest.mock('expo-notifications');
jest.mock('expo-device');

// Mock fetch globally
global.fetch = jest.fn();

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    (Device.isDevice as any) = true;
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('should request permissions on mount', async () => {
    // Setup
    const mockGetPermissions = jest.fn().mockResolvedValue({
      status: 'undetermined',
    });
    const mockRequestPermissions = jest.fn().mockResolvedValue({
      status: 'granted',
    });
    const mockGetToken = jest.fn().mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });

    (Notifications.getPermissionsAsync as jest.Mock) = mockGetPermissions;
    (Notifications.requestPermissionsAsync as jest.Mock) = mockRequestPermissions;
    (Notifications.getExpoPushTokenAsync as jest.Mock) = mockGetToken;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'saved' }),
    });

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    // Wait for async operations
    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify
    expect(mockGetPermissions).toHaveBeenCalled();
    expect(mockRequestPermissions).toHaveBeenCalled();
    expect(result.current.hasPermission).toBe(true);
  });

  test('should get push token and POST to backend', async () => {
    // Setup
    const mockGetPermissions = jest.fn().mockResolvedValue({
      status: 'granted',
    });
    const mockGetToken = jest.fn().mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });

    (Notifications.getPermissionsAsync as jest.Mock) = mockGetPermissions;
    (Notifications.getExpoPushTokenAsync as jest.Mock) = mockGetToken;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'saved' }),
    });

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify token was fetched
    expect(mockGetToken).toHaveBeenCalledWith({
      projectId: 'c4e705ec-1671-4e31-ba01-43d1bc1234c7',
    });
    expect(result.current.token).toBe('ExponentPushToken[test123]');

    // Verify POST request
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/save-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'user_test',
          token: 'ExponentPushToken[test123]',
        }),
      }
    );
  });

  test('should handle permission denial gracefully', async () => {
    // Setup
    const mockGetPermissions = jest.fn().mockResolvedValue({
      status: 'denied',
    });
    const mockRequestPermissions = jest.fn().mockResolvedValue({
      status: 'denied',
    });

    (Notifications.getPermissionsAsync as jest.Mock) = mockGetPermissions;
    (Notifications.requestPermissionsAsync as jest.Mock) = mockRequestPermissions;

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify graceful handling
    expect(result.current.hasPermission).toBe(false);
    expect(result.current.token).toBe(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should handle backend POST failure gracefully', async () => {
    // Setup
    const mockGetPermissions = jest.fn().mockResolvedValue({
      status: 'granted',
    });
    const mockGetToken = jest.fn().mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });

    (Notifications.getPermissionsAsync as jest.Mock) = mockGetPermissions;
    (Notifications.getExpoPushTokenAsync as jest.Mock) = mockGetToken;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify graceful handling (no error thrown)
    expect(result.current.token).toBe('ExponentPushToken[test123]');
    expect(result.current.error).toBe(null);
  });

  test('should skip setup on simulator', async () => {
    // Setup
    (Device.isDevice as any) = false;

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify
    expect(result.current.hasPermission).toBe(false);
    expect(result.current.token).toBe(null);
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  test('should handle missing backend URL gracefully', async () => {
    // Setup
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    
    const mockGetPermissions = jest.fn().mockResolvedValue({
      status: 'granted',
    });
    const mockGetToken = jest.fn().mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });

    (Notifications.getPermissionsAsync as jest.Mock) = mockGetPermissions;
    (Notifications.getExpoPushTokenAsync as jest.Mock) = mockGetToken;

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify graceful handling
    expect(result.current.token).toBe('ExponentPushToken[test123]');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should handle token fetch error gracefully', async () => {
    // Setup
    const mockGetPermissions = jest.fn().mockResolvedValue({
      status: 'granted',
    });
    const mockGetToken = jest.fn().mockRejectedValue(
      new Error('Failed to get token')
    );

    (Notifications.getPermissionsAsync as jest.Mock) = mockGetPermissions;
    (Notifications.getExpoPushTokenAsync as jest.Mock) = mockGetToken;

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify graceful error handling
    expect(result.current.error).toBe('Failed to get token');
    expect(result.current.token).toBe(null);
  });

  test('should not run setup without userId', async () => {
    // Execute
    const { result } = renderHook(() => useNotifications(''));

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify no setup attempted
    expect(result.current.isReady).toBe(false);
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  });

  test('should use granted permissions without requesting again', async () => {
    // Setup
    const mockGetPermissions = jest.fn().mockResolvedValue({
      status: 'granted',
    });
    const mockRequestPermissions = jest.fn();
    const mockGetToken = jest.fn().mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });

    (Notifications.getPermissionsAsync as jest.Mock) = mockGetPermissions;
    (Notifications.requestPermissionsAsync as jest.Mock) = mockRequestPermissions;
    (Notifications.getExpoPushTokenAsync as jest.Mock) = mockGetToken;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'saved' }),
    });

    // Execute
    const { result } = renderHook(() => useNotifications('user_test'));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Verify permissions not requested again
    expect(mockGetPermissions).toHaveBeenCalled();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(result.current.hasPermission).toBe(true);
  });
});
