import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import { useWebSocketAgent } from '@/hooks/useWebSocketAgent';
import { DayView } from '@/components/generative/DayView';

const mockWsInstance = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  onopen: null as ((event: Event) => void) | null,
  onclose: null as ((event: CloseEvent) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  onmessage: null as ((event: MessageEvent) => void) | null,
};

global.WebSocket = jest.fn().mockImplementation(() => mockWsInstance) as any;
(global.WebSocket as any).OPEN = 1;

// Mock expo-linear-gradient for DayView
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

describe('Generative UI Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
    mockWsInstance.onopen = null;
    mockWsInstance.onclose = null;
    mockWsInstance.onerror = null;
    mockWsInstance.onmessage = null;
  });

  it('renders day_view from WebSocket generative_ui events', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
        onUIComponent(setUIEvent);
      }, [connect, onUIComponent]);

      return uiEvent ? (
        <DayView
          events={uiEvent.props.events || []}
          tasks={uiEvent.props.tasks || []}
          display_mode={uiEvent.props.display_mode || 'planning'}
        />
      ) : null;
    };

    const { getByText, getByTestId } = render(<TestComponent />);

    act(() => {
      mockWsInstance.onopen?.(new Event('open'));
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'generative_ui',
            component: 'day_view',
            props: {
              events: [
                {
                  id: 'e1',
                  title: 'Planning',
                  start_time: '2026-12-07T09:00:00Z', // Future date
                  end_time: '2026-12-07T09:30:00Z',
                },
              ],
              tasks: [{ id: 't1', title: 'Write', status: 'pending' }],
              display_mode: 'planning',
            },
          }),
        })
      );
    });

    await waitFor(() => {
      expect(getByText('Today')).toBeTruthy();
      expect(getByText('Planning')).toBeTruthy();
      expect(getByText('Write')).toBeTruthy();
    });
  });

  it('replaces UI with the latest component event', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
        onUIComponent(setUIEvent);
      }, [connect, onUIComponent]);

      if (!uiEvent) return null;
      return (
        <DayView
          events={uiEvent.props.events || []}
          tasks={uiEvent.props.tasks || []}
          display_mode={uiEvent.props.display_mode || 'planning'}
        />
      );
    };

    const { getByText, queryByText } = render(<TestComponent />);

    act(() => {
      mockWsInstance.onopen?.(new Event('open'));
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'generative_ui',
            component: 'day_view',
            props: { 
              events: [],
              tasks: [{ id: 't1', title: 'Old', status: 'pending' }],
              display_mode: 'planning'
            },
          }),
        })
      );
    });

    await waitFor(() => {
      expect(getByText('Today')).toBeTruthy();
      expect(getByText('Old')).toBeTruthy();
    });

    act(() => {
      mockWsInstance.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'generative_ui',
            component: 'day_view',
            props: { 
              events: [],
              tasks: [{ id: 't2', title: 'New', status: 'pending' }],
              display_mode: 'planning'
            },
          }),
        })
      );
    });

    await waitFor(() => {
      expect(getByText('New')).toBeTruthy();
      expect(queryByText('Old')).toBeNull();
    });
  });

  it('ignores malformed WebSocket JSON safely', () => {
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const onUI = jest.fn();
    const TestComponent = () => {
      const { connect, onUIComponent } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      React.useEffect(() => {
        connect();
        onUIComponent(onUI);
      }, [connect, onUIComponent]);
      return null;
    };

    render(<TestComponent />);

    act(() => {
      mockWsInstance.onopen?.(new Event('open'));
      mockWsInstance.onmessage?.(
        new MessageEvent('message', { data: 'not-json' })
      );
    });

    expect(onUI).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
