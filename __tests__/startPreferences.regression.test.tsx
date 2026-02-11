import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSignIn = jest.fn();
const mockGetAccessToken = jest.fn(async () => 'jwt_test');

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user_test' },
    isLoading: false,
    signInWithGoogle: mockSignIn,
    getAccessToken: mockGetAccessToken,
  }),
}));

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useRouter: () => ({
      navigate: mockNavigate,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(() => effect(), []);
    },
  };
});

import StartScreen from '@/app/(start)/index';

global.fetch = jest.fn();

describe('StartScreen preference regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('blocks navigation when preference save returns partial_success', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          preferences: {
            wake_time: '07:00',
            bedtime: '22:30',
            timezone: 'America/New_York',
            health_anchors: ['sleep'],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'partial_success',
          scheduler: {
            resynced: false,
            error: 'cron unavailable',
          },
        }),
      });

    const { getByText, getByDisplayValue } = render(<StartScreen />);

    await waitFor(() => {
      expect(getByDisplayValue('07:00')).toBeTruthy();
      expect(getByDisplayValue('22:30')).toBeTruthy();
    });

    fireEvent.press(getByText('Start Conversation'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    const putCall = (global.fetch as jest.Mock).mock.calls[1];
    const putBody = JSON.parse(putCall[1].body as string);

    expect(putCall[0]).toBe('http://localhost:8080/api/preferences/me');
    expect(putCall[1].headers.Authorization).toBe('Bearer jwt_test');
    expect(putBody.wake_time).toBe('07:00');
    expect(putBody.bedtime).toBe('22:30');
    expect(putBody.timezone).toBeTruthy();
    expect(putBody.health_anchors).toBeUndefined();

    expect(mockNavigate).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        getByText(/Preferences saved, but alarm scheduling failed/i)
      ).toBeTruthy();
    });
  });

  it('navigates only when scheduler is fully resynced', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          preferences: {
            wake_time: '08:15',
            bedtime: '23:00',
            timezone: 'America/New_York',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ok',
          scheduler: {
            resynced: true,
            error: null,
          },
        }),
      });

    const { getByText, getByDisplayValue } = render(<StartScreen />);

    await waitFor(() => {
      expect(getByDisplayValue('08:15')).toBeTruthy();
      expect(getByDisplayValue('23:00')).toBeTruthy();
    });

    fireEvent.press(getByText('Start Conversation'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockNavigate).toHaveBeenCalledWith('../assistant');
  });
});
