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

  it('routes authenticated user to assistant when bootstrap returns assistant', async () => {
    mockUser = { id: 'user_test' };
    mockRunBootstrap.mockResolvedValue('assistant');

    render(<StartScreen />);

    await waitFor(() => {
      expect(mockRunBootstrap).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/assistant');
    });
  });

  it('routes authenticated user to onboarding placeholder when bootstrap says pending', async () => {
    mockUser = { id: 'user_test' };
    mockRunBootstrap.mockResolvedValue('onboarding_placeholder');

    render(<StartScreen />);

    await waitFor(() => {
      expect(mockRunBootstrap).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/onboarding-placeholder');
    });
  });
});
