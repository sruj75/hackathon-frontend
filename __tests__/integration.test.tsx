import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const createPcm16Buffer = (amplitude: number, sampleCount = 320) => {
  const buffer = new ArrayBuffer(sampleCount * 2);
  const view = new DataView(buffer);
  const clamped = Math.max(-32768, Math.min(32767, Math.trunc(amplitude)));
  for (let i = 0; i < sampleCount; i++) {
    view.setInt16(i * 2, clamped, true);
  }
  return buffer;
};

const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockSendAudio = jest.fn();
const mockSendText = jest.fn();
let eventHandler: ((event: any) => void) | null = null;
let audioHandler: ((audioData: ArrayBuffer | string, mimeType?: string) => void) | null =
  null;
let audioDataHandler: ((audioData: ArrayBuffer) => void) | null = null;
const mockOnEvent = jest.fn((callback: (event: any) => void) => {
  eventHandler = callback;
  return jest.fn(() => {
    if (eventHandler === callback) {
      eventHandler = null;
    }
  });
});
const mockOnAudio = jest.fn(
  (callback: (audioData: ArrayBuffer | string, mimeType?: string) => void) => {
    audioHandler = callback;
    return jest.fn(() => {
      if (audioHandler === callback) {
        audioHandler = null;
      }
    });
  }
);
const mockOnUIComponent = jest.fn(() => jest.fn());
const mockStartRecording = jest.fn(async () => undefined);
const mockStopRecording = jest.fn(async () => undefined);
const mockOnAudioData = jest.fn((callback: (audioData: ArrayBuffer) => void) => {
  audioDataHandler = callback;
  return jest.fn(() => {
    if (audioDataHandler === callback) {
      audioDataHandler = null;
    }
  });
});
const mockPlayAudio = jest.fn();
const mockEndPlayback = jest.fn(async () => undefined);
const mockStopPlayback = jest.fn(async () => undefined);
const mockUseWebSocketAgent = jest.fn();
let mockIsPlaying = false;
let mockWsState = { isConnected: false, isConnecting: false, error: null as string | null };

let mockParams: Record<string, string | string[]> = {};
let mockSession: { access_token: string } | null = { access_token: 'jwt_test' };
let mockUser: { id: string } | null = { id: 'user_test' };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockRouterBack,
    replace: mockRouterReplace,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    session: mockSession,
  }),
}));

jest.mock('@/hooks/useAudio', () => ({
  useAudioRecording: () => ({
    isRecording: false,
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    onAudioData: mockOnAudioData,
  }),
  useAudioPlayback: () => ({
    isPlaying: mockIsPlaying,
    playAudio: mockPlayAudio,
    endPlayback: mockEndPlayback,
    stopPlayback: mockStopPlayback,
  }),
}));

jest.mock('@/hooks/useWebSocketAgent', () => ({
  useWebSocketAgent: (...args: any[]) => mockUseWebSocketAgent(...args),
}));

import AssistantScreen from '@/app/assistant/index';

describe('Assistant screen integration', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockSession = { access_token: 'jwt_test' };
    mockUser = { id: 'user_test' };
    eventHandler = null;
    audioHandler = null;
    audioDataHandler = null;
    mockIsPlaying = false;
    mockWsState = { isConnected: false, isConnecting: false, error: null };

    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('connects with session resume params from route', async () => {
    mockParams = {
      resume_session_id: 'session_user_test_2026-02-26',
      trigger_type: 'checkin',
    };

    render(<AssistantScreen />);

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith({
        resume_session_id: 'session_user_test_2026-02-26',
        trigger_type: 'checkin',
        entry_mode: 'proactive',
        source: 'manual',
        event_id: undefined,
        calendar_event_id: undefined,
        scheduled_time: undefined,
      });
    });
  });

  it('connects without options when no deep-link params are present', async () => {
    render(<AssistantScreen />);

    await waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith(undefined);
    });
  });

  it('does not connect when access token is missing', async () => {
    mockSession = null;

    render(<AssistantScreen />);

    await waitFor(() => {
      expect(mockConnect).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[AssistantScreen] Missing access token; cannot connect'
      );
    });
  });

  it('disconnects on unmount', () => {
    const { unmount } = render(<AssistantScreen />);
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('starts recording immediately for onboarding when WebSocket is connected', async () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);

    await waitFor(() => {
      expect(mockStartRecording).toHaveBeenCalledTimes(1);
    });

    // Clear pending playback-end timer created by turnComplete.
    act(() => {
      eventHandler?.({ interrupted: true });
    });
  });

  it('starts recording immediately for main when WebSocket is connected', async () => {
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);

    await waitFor(() => {
      expect(mockStartRecording).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps non-onboarding uplink unchanged and forwards mic chunks', () => {
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);
    expect(audioDataHandler).not.toBeNull();

    act(() => {
      audioDataHandler?.(createPcm16Buffer(1200));
    });

    expect(mockSendAudio).toHaveBeenCalledTimes(1);
  });

  it('drops onboarding mic chunks during playback echo guard', () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);
    expect(audioHandler).not.toBeNull();
    expect(audioDataHandler).not.toBeNull();

    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });
    act(() => {
      audioDataHandler?.(createPcm16Buffer(500));
    });

    expect(mockSendAudio).not.toHaveBeenCalled();
  });

  it('drops main mic chunks during playback echo guard', () => {
    mockParams = {
      trigger_type: 'checkin',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);
    expect(audioHandler).not.toBeNull();
    expect(audioDataHandler).not.toBeNull();

    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });
    act(() => {
      audioDataHandler?.(createPcm16Buffer(500));
    });

    expect(mockSendAudio).not.toHaveBeenCalled();
  });

  it('suppresses onboarding assistant audio while user speech hold is active', () => {
    jest.useFakeTimers();
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);
    expect(audioDataHandler).not.toBeNull();
    expect(audioHandler).not.toBeNull();

    act(() => {
      audioDataHandler?.(createPcm16Buffer(12000));
    });
    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });

    expect(mockPlayAudio).not.toHaveBeenCalled();
  });

  it('resumes onboarding assistant audio playback after speech hold expires', () => {
    jest.useFakeTimers();
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);
    expect(audioDataHandler).not.toBeNull();
    expect(audioHandler).not.toBeNull();

    act(() => {
      audioDataHandler?.(createPcm16Buffer(12000));
    });
    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });
    expect(mockPlayAudio).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(850);
    });
    act(() => {
      audioHandler?.('BAUG', 'audio/pcm;rate=16000');
    });

    expect(mockPlayAudio).toHaveBeenCalledTimes(1);
    expect(mockPlayAudio).toHaveBeenCalledWith('BAUG', 'audio/pcm;rate=16000');
  });

  it('opens onboarding barge-in path after strong speech during playback', async () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);
    expect(audioHandler).not.toBeNull();
    expect(audioDataHandler).not.toBeNull();

    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });

    const strongSpeech = createPcm16Buffer(12000);
    act(() => {
      audioDataHandler?.(strongSpeech);
      audioDataHandler?.(strongSpeech);
      audioDataHandler?.(strongSpeech);
      audioDataHandler?.(strongSpeech);
    });

    await waitFor(() => {
      expect(mockStopPlayback).toHaveBeenCalledTimes(1);
      expect(mockSendAudio).toHaveBeenCalledTimes(1);
    });

    act(() => {
      audioDataHandler?.(strongSpeech);
    });
    expect(mockSendAudio).toHaveBeenCalledTimes(2);
  });

  it('opens main barge-in path after strong speech during playback', async () => {
    mockParams = {
      trigger_type: 'checkin',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);
    expect(audioHandler).not.toBeNull();
    expect(audioDataHandler).not.toBeNull();

    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });

    const strongSpeech = createPcm16Buffer(12000);
    act(() => {
      audioDataHandler?.(strongSpeech);
      audioDataHandler?.(strongSpeech);
      audioDataHandler?.(strongSpeech);
      audioDataHandler?.(strongSpeech);
    });

    await waitFor(() => {
      expect(mockStopPlayback).toHaveBeenCalledTimes(1);
      expect(mockSendAudio).toHaveBeenCalledTimes(1);
    });

    act(() => {
      audioDataHandler?.(strongSpeech);
    });
    expect(mockSendAudio).toHaveBeenCalledTimes(2);
  });

  it('allows onboarding barge-in while playing by stopping playback on user speech', async () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockIsPlaying = true;
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);

    expect(eventHandler).not.toBeNull();
    act(() => {
      eventHandler?.({
        serverContent: {
          inputTranscription: { text: 'hello there' },
        },
      });
    });

    await waitFor(() => {
      expect(mockStopPlayback).toHaveBeenCalledTimes(1);
    });
  });

  it('continues playing sequential onboarding audio chunks across turn boundaries', async () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);

    expect(audioHandler).not.toBeNull();
    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });
    act(() => {
      eventHandler?.({ turnComplete: true });
    });
    act(() => {
      audioHandler?.('BAUG', 'audio/pcm;rate=16000');
    });

    await waitFor(() => {
      expect(mockPlayAudio).toHaveBeenCalledTimes(2);
      expect(mockPlayAudio).toHaveBeenNthCalledWith(
        1,
        'AQID',
        'audio/pcm;rate=16000'
      );
      expect(mockPlayAudio).toHaveBeenNthCalledWith(
        2,
        'BAUG',
        'audio/pcm;rate=16000'
      );
    });

    // Clear pending playback-end timer created by turnComplete.
    act(() => {
      eventHandler?.({ interrupted: true });
    });
  });

  it('skips onboarding endPlayback for turnComplete events that have no audio', () => {
    jest.useFakeTimers();
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);

    act(() => {
      eventHandler?.({ turnComplete: true });
    });
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(mockEndPlayback).not.toHaveBeenCalled();

    act(() => {
      audioHandler?.('AQID', 'audio/pcm;rate=16000');
    });
    act(() => {
      eventHandler?.({ turnComplete: true });
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockEndPlayback).toHaveBeenCalledTimes(1);
  });

  it('shows onboarding done panel when onboarding_completed system event is received', async () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    const { getByTestId } = render(<AssistantScreen />);

    act(() => {
      eventHandler?.({
        type: 'onboarding_completed',
        next_action: 'show_done_screen',
        route_hint: 'assistant',
      });
    });

    await waitFor(() => {
      expect(getByTestId('onboarding-done-panel')).toBeTruthy();
    });
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('verifies bootstrap on Continue and routes to post_onboarding assistant', async () => {
    mockParams = {
      trigger_type: 'onboarding',
      resume_session_id: 'session_onboarding_user_test',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    const originalFetch = global.fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ route_hint: 'assistant' }),
    } as Response);
    global.fetch = fetchMock as typeof fetch;
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';

    try {
      const { getByTestId } = render(<AssistantScreen />);

      act(() => {
        eventHandler?.({
          type: 'onboarding_completed',
          next_action: 'show_done_screen',
          route_hint: 'assistant',
        });
      });

      fireEvent.press(getByTestId('onboarding-continue-button'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:8080/api/onboarding/bootstrap',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              Authorization: 'Bearer jwt_test',
            }),
          })
        );
      });

      expect(mockRouterReplace).toHaveBeenCalledWith({
        pathname: '/assistant',
        params: {
          trigger_type: 'post_onboarding',
          entry_mode: 'post_onboarding',
          source: 'post_onboarding',
        },
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('stays in onboarding and shows missing fields on onboarding_completion_failed', async () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    const { getByTestId, getByText } = render(<AssistantScreen />);

    act(() => {
      eventHandler?.({
        type: 'onboarding_completion_failed',
        message: 'Please complete missing onboarding fields.',
        missing_fields: ['summary', 'goals'],
      });
    });

    await waitFor(() => {
      expect(getByTestId('onboarding-failure-panel')).toBeTruthy();
      expect(getByText('Missing: summary, goals')).toBeTruthy();
    });
  });

  it('does not auto-handoff on raw complete_onboarding function response', async () => {
    mockParams = {
      trigger_type: 'onboarding',
    };
    mockWsState = { isConnected: true, isConnecting: false, error: null };
    mockUseWebSocketAgent.mockReturnValue({
      state: mockWsState,
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });

    render(<AssistantScreen />);

    act(() => {
      eventHandler?.({
        content: {
          parts: [
            {
              functionResponse: {
                name: 'complete_onboarding',
                response: {
                  status: 'ok',
                  onboarding_status: 'completed',
                  route_hint: 'assistant',
                  handoff_to_main: true,
                },
              },
            },
          ],
        },
      });
    });

    await waitFor(() => {
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });
});
