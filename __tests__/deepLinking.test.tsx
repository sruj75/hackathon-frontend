import React from 'react';
import { render } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

const mockPush = jest.fn();
const mockRemove = jest.fn();
let mockUser: { id: string } | null = { id: 'user_test' };
let capturedListener: ((response: any) => void) | null = null;

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  DarkTheme: {},
  DefaultTheme: {},
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Stack.Screen = () => null;
  return {
    Stack,
    useRouter: () => ({
      push: mockPush,
    }),
  };
});

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));

jest.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: mockUser }),
}));

import RootLayout from '@/app/_layout';

describe('RootLayout deep linking', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user_test' };
    capturedListener = null;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    (
      Notifications.addNotificationResponseReceivedListener as jest.Mock
    ).mockImplementation((listener: (response: any) => void) => {
      capturedListener = listener;
      return { remove: mockRemove };
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('registers notification listener and removes it on unmount', () => {
    const { unmount } = render(<RootLayout />);

    expect(
      Notifications.addNotificationResponseReceivedListener
    ).toHaveBeenCalledTimes(1);

    unmount();

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('routes to assistant with session context when notification carries session_id', () => {
    render(<RootLayout />);

    expect(capturedListener).toBeTruthy();
    capturedListener?.({
      notification: {
        request: {
          content: {
            data: {
              session_id: 'session_user_test_2026-02-26',
              type: 'checkin',
            },
          },
        },
      },
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/assistant',
      params: {
        resume_session_id: 'session_user_test_2026-02-26',
        trigger_type: 'checkin',
      },
    });
  });

  it('routes to plain assistant when notification has no session_id', () => {
    render(<RootLayout />);

    expect(capturedListener).toBeTruthy();
    capturedListener?.({
      notification: {
        request: {
          content: {
            data: {
              type: 'checkin',
            },
          },
        },
      },
    });

    expect(mockPush).toHaveBeenCalledWith('/assistant');
  });

  it('re-subscribes when auth user identity changes', () => {
    const view = render(<RootLayout />);
    expect(
      Notifications.addNotificationResponseReceivedListener
    ).toHaveBeenCalledTimes(1);

    mockUser = { id: 'user_new' };
    view.rerender(<RootLayout />);

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(
      Notifications.addNotificationResponseReceivedListener
    ).toHaveBeenCalledTimes(2);
  });
});
