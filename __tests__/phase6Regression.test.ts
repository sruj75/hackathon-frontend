import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useWebSocketAgent } from '@/hooks/useWebSocketAgent';

type MockWs = {
  send: jest.Mock;
  close: jest.Mock;
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
};

describe('Phase 6 Regression - WebSocket + Generative UI', () => {
  let mockWs: MockWs;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const originalAtob = global.atob;

  beforeAll(() => {
    if (!global.atob) {
      global.atob = (input: string) =>
        Buffer.from(input, 'base64').toString('binary');
    }
  });

  afterAll(() => {
    global.atob = originalAtob;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    mockWs = {
      send: jest.fn(),
      close: jest.fn(),
      readyState: 0,
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    };

    global.WebSocket = jest.fn(() => mockWs as unknown as WebSocket) as any;
    (global.WebSocket as any).OPEN = 1;
    (global.WebSocket as any).CONNECTING = 0;
    (global.WebSocket as any).CLOSED = 3;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
  });

  it('sends init handshake with resume session + trigger type + timezone', async () => {
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.connect({
        resume_session_id: 'session_user_test_2026-02-06',
        trigger_type: 'checkin',
      });
    });

    expect(global.WebSocket).toHaveBeenCalledWith(
      'ws://localhost:8080/ws/session_test'
    );

    act(() => {
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
    });

    await waitFor(() => {
      expect(result.current.state.isConnected).toBe(true);
    });

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const initPayload = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(initPayload).toEqual(
      expect.objectContaining({
        type: 'init',
        access_token: 'jwt_test',
        resume_session_id: 'session_user_test_2026-02-06',
        trigger_type: 'checkin',
      })
    );
    expect(typeof initPayload.timezone).toBe('string');
    expect(initPayload.timezone.length).toBeGreaterThan(0);
  });

  it('sends init handshake for fresh sessions', async () => {
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.connect();
    });

    act(() => {
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
    });

    await waitFor(() => {
      expect(result.current.state.isConnected).toBe(true);
    });

    expect(mockWs.send).toHaveBeenCalledTimes(1);
    const initPayload = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(initPayload.type).toBe('init');
    expect(initPayload.access_token).toBe('jwt_test');
    expect(initPayload.resume_session_id).toBeUndefined();
    expect(initPayload.trigger_type).toBeUndefined();
    expect(typeof initPayload.timezone).toBe('string');
    expect(initPayload.timezone.length).toBeGreaterThan(0);
  });

  it('routes generative_ui events to onUIComponent callback only', () => {
    const onUIComponent = jest.fn();
    const onEvent = jest.fn();

    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.onUIComponent(onUIComponent);
      result.current.onEvent(onEvent);
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
    });

    act(() => {
      mockWs.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'generative_ui',
            component: 'day_view',
            props: {
              events: [{ id: 'e1', title: 'Meeting' }],
              tasks: [{ id: 't1', title: 'Task', status: 'pending' }],
            },
          }),
        })
      );
    });

    expect(onUIComponent).toHaveBeenCalledTimes(1);
    expect(onUIComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'day_view',
        props: {
          events: [{ id: 'e1', title: 'Meeting' }],
          tasks: [{ id: 't1', title: 'Task', status: 'pending' }],
        },
      })
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('forwards onboarding_completed system events through onEvent', () => {
    const onEvent = jest.fn();
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.onEvent(onEvent);
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
    });

    act(() => {
      mockWs.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'onboarding_completed',
            next_action: 'show_done_screen',
            route_hint: 'assistant',
          }),
        })
      );
    });

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'onboarding_completed',
        next_action: 'show_done_screen',
        route_hint: 'assistant',
      })
    );
  });

  it('still processes regular ADK events and audio payloads', () => {
    const onAudio = jest.fn();
    const onEvent = jest.fn();

    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.onAudio(onAudio);
      result.current.onEvent(onEvent);
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
    });

    act(() => {
      mockWs.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: 'AQID',
                  },
                },
              ],
            },
            partial: false,
          }),
        })
      );
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onAudio).toHaveBeenCalledTimes(1);
    const audioPayload = onAudio.mock.calls[0][0] as string;
    expect(audioPayload).toBe('AQID');
  });

  it('does not reconnect after manual disconnect when retry is pending', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.connect();
    });

    expect(global.WebSocket).toHaveBeenCalledTimes(1);

    act(() => {
      mockWs.onerror?.(new Event('error'));
    });

    act(() => {
      result.current.disconnect();
    });

    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(global.WebSocket).toHaveBeenCalledTimes(1);
  });

  it('does not invoke unsubscribed event listeners', () => {
    const onEvent = jest.fn();
    const onAudio = jest.fn();

    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    let unsubscribeEvent = () => {};
    let unsubscribeAudio = () => {};
    act(() => {
      unsubscribeEvent = result.current.onEvent(onEvent);
      unsubscribeAudio = result.current.onAudio(onAudio);
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
    });

    act(() => {
      unsubscribeEvent();
      unsubscribeAudio();
    });

    act(() => {
      mockWs.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            content: {
              parts: [
                { text: 'hello world' },
                {
                  inlineData: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: 'AQID',
                  },
                },
              ],
            },
            partial: false,
          }),
        })
      );
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(onAudio).not.toHaveBeenCalled();
  });

  it('does not invoke unsubscribed ui listeners', () => {
    const onUI = jest.fn();

    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    let unsubscribeUI = () => {};
    act(() => {
      unsubscribeUI = result.current.onUIComponent(onUI);
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
      unsubscribeUI();
    });

    act(() => {
      mockWs.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'generative_ui',
            component: 'day_view',
            props: { tasks: [] },
          }),
        })
      );
    });

    expect(onUI).not.toHaveBeenCalled();
  });

  it('does not reconnect when connect is called while already connecting', () => {
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.connect();
      result.current.connect();
    });

    expect(global.WebSocket).toHaveBeenCalledTimes(1);
  });

  it('surfaces missing access token and never opens a socket', async () => {
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', null)
    );

    act(() => {
      result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.state.error).toBe('Missing access token');
    });

    expect(global.WebSocket).not.toHaveBeenCalled();
  });

  it('marks state disconnected on close when not retrying', async () => {
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
    });

    await waitFor(() => {
      expect(result.current.state.isConnected).toBe(true);
    });

    act(() => {
      const closeEvent = Object.assign(new Event('close'), {
        code: 1000,
        reason: 'bye',
      });
      mockWs.onclose?.(closeEvent as CloseEvent);
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({
        isConnected: false,
        isConnecting: false,
        error: null,
      });
    });
  });

  it('stops retrying after max retries and sets connection error', async () => {
    jest.useFakeTimers();
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.connect();
    });

    act(() => {
      mockWs.onerror?.(new Event('error'));
      jest.advanceTimersByTime(2000);
      mockWs.onerror?.(new Event('error'));
      jest.advanceTimersByTime(4000);
      mockWs.onerror?.(new Event('error'));
      jest.advanceTimersByTime(6000);
      mockWs.onerror?.(new Event('error'));
    });

    await waitFor(() => {
      expect(result.current.state.error).toBe('Connection failed after 3 attempts');
    });

    expect(global.WebSocket).toHaveBeenCalled();
  });

  it('forwards ArrayBuffer messages to audio listeners', () => {
    const onAudio = jest.fn();
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    const buffer = new ArrayBuffer(8);

    act(() => {
      result.current.onAudio(onAudio);
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
      mockWs.onmessage?.(new MessageEvent('message', { data: buffer }));
    });

    expect(onAudio).toHaveBeenCalledWith(buffer);
  });

  it('forwards Blob messages to audio listeners', async () => {
    const onAudio = jest.fn();
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    const blob = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/octet-stream',
    });

    act(() => {
      result.current.onAudio(onAudio);
      result.current.connect();
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
      mockWs.onmessage?.(new MessageEvent('message', { data: blob }));
    });

    await waitFor(() => {
      expect(onAudio).toHaveBeenCalledTimes(1);
      expect(onAudio.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
    });
  });

  it('sendAudio and sendText only send when socket is open', () => {
    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );
    const rawAudio = new ArrayBuffer(4);

    act(() => {
      result.current.connect();
      result.current.sendAudio(rawAudio);
      result.current.sendText('before-open');
    });

    expect(mockWs.send).toHaveBeenCalledTimes(0);

    act(() => {
      mockWs.readyState = 1;
      mockWs.onopen?.(new Event('open'));
      result.current.sendAudio(rawAudio);
      result.current.sendText('after-open');
    });

    expect(mockWs.send).toHaveBeenCalledWith(rawAudio);
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'text', text: 'after-open' })
    );
  });

  it('surfaces invalid backend URL format as a connection error', async () => {
    process.env.EXPO_PUBLIC_BACKEND_URL = 'localhost:8080';

    const { result } = renderHook(() =>
      useWebSocketAgent('session_test', 'jwt_test')
    );

    act(() => {
      result.current.connect();
    });

    await waitFor(() => {
      expect(result.current.state.error).toContain(
        'EXPO_PUBLIC_BACKEND_URL must start with http:// or https://'
      );
    });

    expect(global.WebSocket).not.toHaveBeenCalled();
  });
});
