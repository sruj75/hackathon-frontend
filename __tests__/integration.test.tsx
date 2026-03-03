import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

const mockRouterBack = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockSendAudio = jest.fn();
const mockSendText = jest.fn();
let eventHandler: ((event: any) => void) | null = null;
let audioHandler: ((audioData: ArrayBuffer | string, mimeType?: string) => void) | null =
  null;
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
const mockOnAudioData = jest.fn(() => jest.fn());
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

  it('keeps non-onboarding auto-start behavior gated until turnComplete', async () => {
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

    expect(mockStartRecording).not.toHaveBeenCalled();
    expect(eventHandler).not.toBeNull();

    act(() => {
      eventHandler?.({ turnComplete: true });
    });

    await waitFor(() => {
      expect(mockStartRecording).toHaveBeenCalledTimes(1);
    });
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
});
