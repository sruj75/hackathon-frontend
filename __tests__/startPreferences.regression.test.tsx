import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockSignIn = jest.fn();
const mockGetAccessToken = jest.fn(async () => 'jwt_test');
const mockSetSigningIn = jest.fn();
const mockSetError = jest.fn();
const mockClearError = jest.fn();
const mockResetState = jest.fn();
const mockStartSetup = jest.fn();
const mockCancelSetup = jest.fn();
const mockRetrySetup = jest.fn();
const mockRecheckAfterForeground = jest.fn();

let mockUser: { id: string } | null = null;
let mockAuthLoading = false;
let mockBootstrapState = {
  phase: 'idle',
  progress: '',
  error: null as string | null,
  errorCode: null as string | null,
  ready: null as
    | {
        route: 'assistant' | 'onboarding';
        resumeSessionId?: string;
      }
    | null,
  isBusy: false,
  isStalled: false,
  canCancel: false,
  canRetry: false,
};

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: mockAuthLoading,
    signInWithGoogle: mockSignIn,
    getAccessToken: mockGetAccessToken,
  }),
}));

jest.mock('@/hooks/useAuthBootstrap', () => ({
  useAuthBootstrap: () => ({
    state: mockBootstrapState,
    setSigningIn: mockSetSigningIn,
    setError: mockSetError,
    clearError: mockClearError,
    resetState: mockResetState,
    startSetup: mockStartSetup,
    cancelSetup: mockCancelSetup,
    retrySetup: mockRetrySetup,
    recheckAfterForeground: mockRecheckAfterForeground,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
}));

import StartScreen from '@/app/(start)/index';

describe('StartScreen bootstrap regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
    mockUser = null;
    mockAuthLoading = false;
    mockBootstrapState = {
      phase: 'idle',
      progress: '',
      error: null,
      errorCode: null,
      ready: null,
      isBusy: false,
      isStalled: false,
      canCancel: false,
      canRetry: false,
    };
    mockStartSetup.mockResolvedValue(undefined);
    mockRetrySetup.mockResolvedValue(undefined);
    mockRecheckAfterForeground.mockResolvedValue(undefined);
  });

  it('unauthenticated tap triggers sign-in then setup start', async () => {
    const { getByText } = render(<StartScreen />);
    fireEvent.press(getByText('Sign In With Google'));

    await waitFor(() => {
      expect(mockSetSigningIn).toHaveBeenCalledTimes(1);
      expect(mockSignIn).toHaveBeenCalledTimes(1);
      expect(mockStartSetup).toHaveBeenCalledTimes(1);
    });
  });

  it('shows Start onboarding agent and does not auto-route when ready for onboarding', () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'ready',
      ready: {
        route: 'onboarding',
        resumeSessionId: 'session_onboarding_user_test',
      },
    };

    const { getByText } = render(<StartScreen />);
    expect(getByText('Start onboarding agent')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes onboarding only on second button tap with optional resume session id', async () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'ready',
      ready: {
        route: 'onboarding',
        resumeSessionId: 'session_onboarding_user_test',
      },
    };

    const { getByTestId } = render(<StartScreen />);
    fireEvent.press(getByTestId('start-agent-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/assistant',
        params: {
          trigger_type: 'onboarding',
          resume_session_id: 'session_onboarding_user_test',
        },
      });
    });
  });

  it('shows Open assistant and routes to /assistant on second button tap', async () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'ready',
      ready: { route: 'assistant' },
    };

    const { getByText, getByTestId } = render(<StartScreen />);
    expect(getByText('Open assistant')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('start-agent-button'));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/assistant');
    });
  });

  it('notification denied path blocks readiness and shows settings + retry controls', () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'error',
      error: 'Notification permission is required. Please allow it in Settings.',
      errorCode: 'notification_required',
      canRetry: true,
    };

    const { getByTestId, queryByTestId, getByText } = render(<StartScreen />);
    expect(getByTestId('start-open-settings-button')).toBeTruthy();
    expect(getByTestId('start-retry-button')).toBeTruthy();
    expect(queryByTestId('start-agent-button')).toBeNull();
    expect(getByText(/Notification permission is required/i)).toBeTruthy();
  });

  it('mic denied path blocks readiness and surfaces error', () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'error',
      error: 'Microphone permission is required. Please allow it and tap continue.',
      errorCode: 'microphone_required',
      canRetry: true,
    };

    const { queryByTestId, getByText } = render(<StartScreen />);
    expect(queryByTestId('start-agent-button')).toBeNull();
    expect(getByText(/Microphone permission is required/i)).toBeTruthy();
  });

  it('retry from error exits blocked state via retry action', async () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'error',
      error: 'Something went wrong',
      errorCode: 'unknown',
      canRetry: true,
    };

    const { getByTestId } = render(<StartScreen />);
    fireEvent.press(getByTestId('start-retry-button'));

    await waitFor(() => {
      expect(mockRetrySetup).toHaveBeenCalledTimes(1);
    });
  });

  it('busy state includes requesting notifications and shows cancel setup', () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'requesting_notifications',
      progress: 'Requesting notification permission...',
      isBusy: true,
      canCancel: true,
    };

    const { getByText, getByTestId } = render(<StartScreen />);
    expect(getByText('Setting Up...')).toBeTruthy();
    expect(getByTestId('start-primary-button').props.accessibilityState.disabled).toBe(
      true
    );
    expect(getByTestId('start-cancel-button')).toBeTruthy();
  });

  it('cancel setup button triggers cancel action', () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'verifying_setup',
      isBusy: true,
      canCancel: true,
    };

    const { getByTestId } = render(<StartScreen />);
    fireEvent.press(getByTestId('start-cancel-button'));
    expect(mockCancelSetup).toHaveBeenCalledTimes(1);
  });

  it('shows stalled hint while setup is busy and stalled', () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      ...mockBootstrapState,
      phase: 'connecting_tools',
      isBusy: true,
      isStalled: true,
      canCancel: true,
    };

    const { getByText } = render(<StartScreen />);
    expect(getByText(/Still working. You can wait or cancel and retry./i)).toBeTruthy();
  });
});
