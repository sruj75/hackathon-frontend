import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import StartScreen from '@/app/(start)/index';

const mockNavigate = jest.fn();

jest.mock('@/constants/user', () => ({
  getSingleUserId: () => 'user_test',
}));

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useRouter: () => ({
      navigate: mockNavigate,
    }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(() => effect(), [effect]);
    },
  };
});

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
            timezone: 'UTC',
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

    fireEvent.press(getByText('Start Voice Assistant'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    const putCall = (global.fetch as jest.Mock).mock.calls[1];
    const putBody = JSON.parse(putCall[1].body as string);

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
            timezone: 'UTC',
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

    fireEvent.press(getByText('Start Voice Assistant'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockNavigate).toHaveBeenCalledWith('../assistant');
  });
});
