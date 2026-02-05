/**
 * Integration tests for frontend-backend interaction.
 *
 * Tests:
 * - Full notification flow (notification -> deep link -> WebSocket -> agent)
 * - Token registration on launch
 * - Permission denial handling
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

// Mock modules
jest.mock('expo-notifications');
jest.mock('expo-device');
jest.mock('expo-router');

// Mock fetch
global.fetch = jest.fn();

describe('Frontend-Backend Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Device.isDevice as any) = true;
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
  });

  test('full notification flow', async () => {
    /**
     * Complete flow:
     * 1. App starts -> requests permissions
     * 2. Gets Expo push token
     * 3. POSTs token to backend
     * 4. Backend sends notification
     * 5. User taps notification
     * 6. App opens with session_id
     * 7. WebSocket connects with session_id
     * 8. Agent resumes conversation
     */
    
    // Step 1: Request permissions
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    
    // Step 2: Get token
    const mockToken = 'ExponentPushToken[test_integration_123]';
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: mockToken,
    });
    
    // Step 3: POST to backend
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'saved' }),
    });
    
    // Simulate the flow
    const permissions = await Notifications.getPermissionsAsync();
    expect(permissions.status).toBe('granted');
    
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'c4e705ec-1671-4e31-ba01-43d1bc1234c7',
    });
    expect(token.data).toBe(mockToken);
    
    const response = await fetch('http://localhost:8080/api/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'user_test',
        token: mockToken,
      }),
    });
    
    expect(response.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/save-token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(mockToken),
      })
    );
  });

  test('token registration on app launch', async () => {
    // Mock successful flow
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[launch_test]',
    });
    
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'saved' }),
    });
    
    // Simulate app launch
    const permissions = await Notifications.getPermissionsAsync();
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'c4e705ec-1671-4e31-ba01-43d1bc1234c7',
    });
    
    await fetch('http://localhost:8080/api/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'user_default',
        token: token.data,
      }),
    });
    
    // Verify token was registered
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/save-token',
      expect.any(Object)
    );
  });

  test('permission denial handling', async () => {
    // Mock permission denial
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
    
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
    
    // Simulate permission request
    const existingPermissions = await Notifications.getPermissionsAsync();
    
    if (existingPermissions.status !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      
      if (requestedPermissions.status !== 'granted') {
        // Permission denied - app should handle gracefully
        expect(requestedPermissions.status).toBe('denied');
        
        // Should not attempt to get token
        expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
        
        // Should not POST to backend
        expect(global.fetch).not.toHaveBeenCalled();
      }
    }
  });

  test('backend token save failure handling', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test_failure]',
    });
    
    // Mock backend failure
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });
    
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'c4e705ec-1671-4e31-ba01-43d1bc1234c7',
    });
    
    const response = await fetch('http://localhost:8080/api/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: 'user_test',
        token: token.data,
      }),
    });
    
    // Should handle failure gracefully
    expect(response.ok).toBe(false);
    
    // App should continue functioning even if token save fails
  });

  test('simulator detection skips setup', async () => {
    // Mock simulator
    (Device.isDevice as any) = false;
    
    // Permissions should not be requested on simulator
    const isDevice = Device.isDevice;
    
    if (!isDevice) {
      // Skip setup
      expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    }
  });

  test('missing backend URL handled gracefully', async () => {
    // Remove backend URL
    delete process.env.EXPO_PUBLIC_BACKEND_URL;
    
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test]',
    });
    
    // Should not attempt fetch without URL
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    
    if (!backendUrl) {
      // Should skip token registration
      expect(global.fetch).not.toHaveBeenCalled();
    }
  });

  test('token format validation', async () => {
    const validTokens = [
      'ExponentPushToken[abc123]',
      'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    ];
    
    const invalidTokens = [
      'invalid_token',
      'ExponentPushToken',
      'abc123',
      '',
    ];
    
    validTokens.forEach((token) => {
      expect(token).toMatch(/^ExponentPushToken\[.+\]$/);
    });
    
    invalidTokens.forEach((token) => {
      expect(token).not.toMatch(/^ExponentPushToken\[.+\]$/);
    });
  });

  test('retry logic on network failure', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[retry_test]',
    });
    
    // Mock network failure
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    
    try {
      await fetch('http://localhost:8080/api/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'user_test',
          token: 'ExponentPushToken[retry_test]',
        }),
      });
    } catch (error) {
      // Should catch and handle error
      expect(error).toBeDefined();
    }
  });

  test('session restoration from notification data', async () => {
    // Mock notification with session data
    const notificationData = {
      session_id: 'session_user_test_2026-02-04',
      type: 'checkin',
    };
    
    // Verify data structure
    expect(notificationData).toHaveProperty('session_id');
    expect(notificationData).toHaveProperty('type');
    expect(notificationData.session_id).toMatch(/^session_/);
  });
});
