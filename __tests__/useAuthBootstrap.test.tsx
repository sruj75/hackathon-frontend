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

function connectedComposioApps() {
  return [
    {
      app: 'googlecalendar',
      connected: true,
      status: 'connected',
    },
    {
      app: 'googletasks',
      connected: true,
      status: 'connected',
    },
  ];
}

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
        apps: connectedComposioApps(),
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

    await act(async () => {
      await result.current.startSetup();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('error');
    });
    expect(result.current.state.errorCode).toBe('microphone_required');
    expect(result.current.state.error).toContain('Microphone permission is required');
  });

  it('blocks setup when notification permission is denied', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'ok',
        apps: connectedComposioApps(),
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

    await act(async () => {
      await result.current.startSetup();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('error');
    });
    expect(result.current.state.errorCode).toBe('notification_required');
    expect(result.current.state.error).toContain(
      'Notification permission is required'
    );
  });

  it('reaches ready phase and keeps onboarding route payload', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: connectedComposioApps(),
          all_connected: true,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_123',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    await act(async () => {
      await result.current.startSetup();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('ready');
    });
    expect(result.current.state.ready).toEqual({
      route: 'onboarding',
      resumeSessionId: 'session_123',
    });
  });

  it('accepts iOS provisional notification authorization as granted', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: connectedComposioApps(),
          all_connected: true,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_abc',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
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

    await act(async () => {
      await result.current.startSetup();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('ready');
    });
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('cancel aborts in-flight setup and keeps state cancelled even if late response arrives', async () => {
    let resolveFetch: ((value: unknown) => void) | null = null;
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    await act(async () => {
      void result.current.startSetup();
    });

    await act(async () => {
      result.current.cancelSetup();
    });

    expect(result.current.state.phase).toBe('cancelled');
    expect(result.current.state.canRetry).toBe(true);

    await act(async () => {
      resolveFetch?.({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: connectedComposioApps(),
          all_connected: true,
          onboarding_status: 'completed',
          route_hint: 'assistant',
        }),
      });
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('cancelled');
  });

  it('retry after error restarts setup and reaches ready state', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'bootstrap failed',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: connectedComposioApps(),
          all_connected: true,
          onboarding_status: 'completed',
          route_hint: 'assistant',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    await act(async () => {
      await result.current.startSetup();
    });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('error');
    });

    await act(async () => {
      await result.current.retrySetup();
    });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('ready');
    });
    expect(result.current.state.ready).toEqual({ route: 'assistant' });
  });

  it('foreground recheck resumes setup when notification permission was granted in settings', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: connectedComposioApps(),
          all_connected: true,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_900',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: connectedComposioApps(),
          all_connected: true,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_900',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      });

    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'denied' })
      .mockResolvedValueOnce({ status: 'granted' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    await act(async () => {
      await result.current.startSetup();
    });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('error');
    });
    expect(result.current.state.errorCode).toBe('notification_required');

    await act(async () => {
      await result.current.recheckAfterForeground();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('ready');
    });
    expect(result.current.state.ready).toEqual({
      route: 'onboarding',
      resumeSessionId: 'session_900',
    });
  });

  it('enforces required Composio connections even when route_hint is onboarding', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: [
            { app: 'googlecalendar', connected: false, status: 'pending' },
            { app: 'googletasks', connected: false, status: 'pending' },
          ],
          all_connected: false,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_connect_required',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          links: [
            { app: 'googlecalendar', redirect_url: 'https://example.com/cal' },
            { app: 'googletasks', redirect_url: 'https://example.com/tasks' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          apps: connectedComposioApps(),
          all_connected: true,
          onboarding_status: 'pending',
          route_hint: 'onboarding',
          onboarding_session_id: 'session_connect_required',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      });

    const { result } = renderHook(() =>
      useAuthBootstrap('http://localhost:8080', getAccessToken)
    );

    await act(async () => {
      await result.current.startSetup();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe('ready');
    });
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledTimes(2);
    expect(result.current.state.ready).toEqual({
      route: 'onboarding',
      resumeSessionId: 'session_connect_required',
    });
  });
});
