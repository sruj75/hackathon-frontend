import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockRouterBack = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockSendAudio = jest.fn();
const mockSendText = jest.fn();
const mockOnEvent = jest.fn(() => jest.fn());
const mockOnAudio = jest.fn(() => jest.fn());
const mockOnUIComponent = jest.fn(() => jest.fn());
const mockStartRecording = jest.fn(async () => undefined);
const mockStopRecording = jest.fn(async () => undefined);
const mockOnAudioData = jest.fn(() => jest.fn());
const mockPlayAudio = jest.fn();
const mockEndPlayback = jest.fn(async () => undefined);
const mockStopPlayback = jest.fn(async () => undefined);
const mockUseWebSocketAgent = jest.fn();

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
    isPlaying: false,
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

    mockUseWebSocketAgent.mockReturnValue({
      state: { isConnected: false, isConnecting: false, error: null },
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendAudio: mockSendAudio,
      sendText: mockSendText,
      onEvent: mockOnEvent,
      onAudio: mockOnAudio,
      onUIComponent: mockOnUIComponent,
    });
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
});
