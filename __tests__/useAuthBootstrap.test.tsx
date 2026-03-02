import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { AudioStreamModule } from 'expo-realtime-audio';

import { useAuthBootstrap } from '@/hooks/useAuthBootstrap';

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'intentive://composio/callback'),
  openURL: jest.fn(async () => undefined),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  IosAuthorizationStatus: {
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
}));

jest.mock('expo-realtime-audio', () => ({
  AudioStreamModule: {
    requestPermissions: jest.fn(),
  },
}));

(global as any).fetch = jest.fn();

describe('useAuthBootstrap', () => {
  const getAccessToken = jest.fn(async () => 'jwt_test');

  beforeEach(() => {
    jest.clearAllMocks();
    (Device as any).isDevice = true;
    (AudioStreamModule.requestPermissions as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExponentPushToken[test123]',
    });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'intentive://composio/callback',
    });
    (global.fetch as jest.Mock).mockReset();
  });

  it('blocks setup when microphone permission is denied', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        apps: [],
        all_connected: true,
        onboarding_status: 'completed',
        route_hint: 'assistant',
      }),
    });
    (AudioStreamModule.requestPermissions as jest.Mock).mockResolvedValue({
      granted: false,
    });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    let bootstrapResult = null;
    await act(async () => {
      bootstrapResult = await result.current.runBootstrap();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('error');
    });
    expect(bootstrapResult).toBeNull();
    expect(result.current.state.error).toContain('Microphone permission is required');
  });

  it('blocks setup when notification permission is denied', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        apps: [],
        all_connected: true,
        onboarding_status: 'pending',
        route_hint: 'onboarding',
        onboarding_session_id: 'session_123',
      }),
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    let bootstrapResult = null;
    await act(async () => {
      bootstrapResult = await result.current.runBootstrap();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('error');
    });
    expect(bootstrapResult).toBeNull();
    expect(result.current.state.error).toContain(
      'Notification permission is required'
    );
  });

  it('fails gracefully when bootstrap request times out', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    (global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    let bootstrapResult = null;
    await act(async () => {
      bootstrapResult = await result.current.runBootstrap();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('error');
    });
    expect(bootstrapResult).toBeNull();
    expect(result.current.state.error).toContain(
      'Timed out while checking your account setup'
    );
  });

  it('returns onboarding route when setup fully succeeds', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: [],
          all_connected: true,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_123',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    let bootstrapResult = null;
    await act(async () => {
      bootstrapResult = await result.current.runBootstrap();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('routing');
    });
    expect(bootstrapResult).toEqual({
      route: 'onboarding',
      onboardingSessionId: 'session_123',
    });
  });

  it('accepts iOS provisional notification authorization as granted', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: [],
          all_connected: true,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_abc',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      ios: {
        status: 3,
      },
    });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    let bootstrapResult = null;
    await act(async () => {
      bootstrapResult = await result.current.runBootstrap();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('idle');
    });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(bootstrapResult).toEqual({
      route: 'onboarding',
      onboardingSessionId: 'session_abc',
    });
  });
});
