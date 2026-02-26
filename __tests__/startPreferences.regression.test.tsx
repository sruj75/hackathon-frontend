import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockSignIn = jest.fn();
const mockGetAccessToken = jest.fn(async () => 'jwt_test');
const mockRunBootstrap = jest.fn();
const mockSetSigningIn = jest.fn();
const mockSetError = jest.fn();
const mockClearError = jest.fn();

let mockUser: { id: string } | null = null;
let mockAuthLoading = false;
let mockBootstrapState = {
  phase: 'idle',
  progress: '',
  error: null as string | null,
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
    runBootstrap: mockRunBootstrap,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

import StartScreen from '@/app/(start)/index';

describe('StartScreen bootstrap regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
    mockAuthLoading = false;
    mockBootstrapState = {
      phase: 'idle',
      progress: '',
      error: null,
    };
    mockRunBootstrap.mockResolvedValue(null);
  });

  it('starts Google sign-in when unauthenticated user taps primary button', async () => {
    const { getByText } = render(<StartScreen />);

    fireEvent.press(getByText('Sign In With Google'));

    await waitFor(() => {
      expect(mockSetSigningIn).toHaveBeenCalledTimes(1);
      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });
    expect(mockRunBootstrap).not.toHaveBeenCalled();
  });

  it('routes authenticated user to assistant when bootstrap returns assistant after tap', async () => {
    mockUser = { id: 'user_test' };
    mockRunBootstrap.mockResolvedValue({
      route: 'assistant',
      onboardingSessionId: null,
    });

    const { getByTestId } = render(<StartScreen />);

    fireEvent.press(getByTestId('start-primary-button'));

    await waitFor(() => {
      expect(mockRunBootstrap).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/assistant');
    });
  });

  it('routes authenticated user to assistant onboarding mode when bootstrap says pending after tap', async () => {
    mockUser = { id: 'user_test' };
    mockRunBootstrap.mockResolvedValue({
      route: 'onboarding',
      onboardingSessionId: 'session_onboarding_user_test',
    });

    const { getByTestId } = render(<StartScreen />);

    fireEvent.press(getByTestId('start-primary-button'));

    await waitFor(() => {
      expect(mockRunBootstrap).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/assistant',
        params: {
          trigger_type: 'onboarding',
          resume_session_id: 'session_onboarding_user_test',
        },
      });
    });
  });

  it('does not navigate when authenticated bootstrap returns null', async () => {
    mockUser = { id: 'user_test' };
    mockRunBootstrap.mockResolvedValue(null);

    const { getByTestId } = render(<StartScreen />);
    fireEvent.press(getByTestId('start-primary-button'));

    await waitFor(() => {
      expect(mockRunBootstrap).toHaveBeenCalledTimes(1);
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('handles sign-in error objects and surfaces their message', async () => {
    mockSignIn.mockRejectedValue(new Error('OAuth unavailable'));

    const { getByText } = render(<StartScreen />);
    fireEvent.press(getByText('Sign In With Google'));

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith('OAuth unavailable');
    });
  });

  it('falls back to default sign-in error message for non-error throws', async () => {
    mockSignIn.mockRejectedValue('unexpected');

    const { getByText } = render(<StartScreen />);
    fireEvent.press(getByText('Sign In With Google'));

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith('Google sign-in failed');
    });
  });

  it('routes onboarding without session id using only onboarding trigger', async () => {
    mockUser = { id: 'user_test' };
    mockRunBootstrap.mockResolvedValue({
      route: 'onboarding',
      onboardingSessionId: null,
    });

    const { getByTestId } = render(<StartScreen />);
    fireEvent.press(getByTestId('start-primary-button'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/assistant',
        params: {
          trigger_type: 'onboarding',
        },
      });
    });
  });

  it('shows setup loading state and disables primary button while busy', () => {
    mockUser = { id: 'user_test' };
    mockBootstrapState = {
      phase: 'verifying',
      progress: '',
      error: null,
    };

    const { getByText, getByTestId } = render(<StartScreen />);
    expect(getByText('Setting Up...')).toBeTruthy();
    expect(getByTestId('start-primary-button').props.accessibilityState.disabled).toBe(
      true
    );
  });
});
