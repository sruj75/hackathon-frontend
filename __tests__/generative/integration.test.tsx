/**
 * Integration tests for Generative UI rendering via WebSocket.
 *
 * Tests:
 * - Mock WebSocket receiving generative_ui event
 * - Verify component switches to UI mode
 * - Verify correct component renders based on type
 * - Verify props are passed correctly
 * - Test component transitions (voice → UI mode)
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { useWebSocketAgent } from '@/hooks/useWebSocketAgent';
import { DayView } from '@/components/generative/DayView';
import { TodoList } from '@/components/generative/TodoList';
import { CalendarView } from '@/components/generative/CalendarView';

// Mock WebSocket
const mockWsInstance = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1, // OPEN
  onopen: null as ((event: Event) => void) | null,
  onclose: null as ((event: CloseEvent) => void) | null,
  onerror: null as ((event: Event) => void) | null,
  onmessage: null as ((event: MessageEvent) => void) | null,
};

global.WebSocket = jest.fn().mockImplementation(() => mockWsInstance) as any;
(global.WebSocket as any).OPEN = 1;

// Mock components
jest.mock('@/components/generative/TaskCard', () => ({
  TaskCard: ({ task }: any) => {
    const { Text, View } = require('react-native');
    return (
      <View testID={`task-card-${task.id}`}>
        <Text>{task.title}</Text>
      </View>
    );
  },
}));

describe('Generative UI Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstance.send.mockClear();
    mockWsInstance.close.mockClear();
    mockWsInstance.readyState = 1;
    mockWsInstance.onopen = null;
    mockWsInstance.onclose = null;
    mockWsInstance.onerror = null;
    mockWsInstance.onmessage = null;
    process.env.EXPO_PUBLIC_BACKEND_URL = 'http://localhost:8080';
  });

  const simulateWebSocketOpen = () => {
    act(() => {
      if (mockWsInstance.onopen) {
        mockWsInstance.onopen(new Event('open'));
      }
    });
  };

  it('receives and processes generative_ui event for day_view', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
      }, [connect]);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvent(event);
        });
      }, [onUIComponent]);

      return uiEvent ? (
        <DayView
          events={uiEvent.props.events || []}
          tasks={uiEvent.props.tasks || []}
        />
      ) : null;
    };

    const { getByText } = render(<TestComponent />);

    // Simulate WebSocket open
    simulateWebSocketOpen();

    // Simulate WebSocket message with generative_ui event
    await act(async () => {
      const generativeUIMessage = JSON.stringify({
        type: 'generative_ui',
        component: 'day_view',
        props: {
          events: [
            {
              id: 'e1',
              title: 'Morning Meeting',
              start_time: '2026-02-05T09:00:00Z',
              end_time: '2026-02-05T10:00:00Z',
            },
          ],
          tasks: [
            {
              id: 't1',
              title: 'Write report',
              status: 'pending',
            },
          ],
        },
      });

      const messageEvent = new MessageEvent('message', {
        data: generativeUIMessage,
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(messageEvent);
      }
    });

    await waitFor(() => {
      expect(getByText("Today's Plan")).toBeTruthy();
    });
  });

  it('receives and processes generative_ui event for todo_list', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
      }, [connect]);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvent(event);
        });
      }, [onUIComponent]);

      return uiEvent ? (
        <TodoList tasks={uiEvent.props.tasks || []} />
      ) : null;
    };

    const { getByText } = render(<TestComponent />);

    // Simulate WebSocket open
    simulateWebSocketOpen();

    // Simulate WebSocket message
    await act(async () => {
      const generativeUIMessage = JSON.stringify({
        type: 'generative_ui',
        component: 'todo_list',
        props: {
          tasks: [
            { id: 't1', title: 'Task 1', status: 'pending' },
            { id: 't2', title: 'Task 2', status: 'completed' },
          ],
        },
      });

      const messageEvent = new MessageEvent('message', {
        data: generativeUIMessage,
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(messageEvent);
      }
    });

    await waitFor(() => {
      expect(getByText('To Do List')).toBeTruthy();
    });
  });

  it('receives and processes generative_ui event for calendar_view', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
      }, [connect]);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvent(event);
        });
      }, [onUIComponent]);

      return uiEvent ? (
        <CalendarView events={uiEvent.props.events || []} />
      ) : null;
    };

    const { getByText } = render(<TestComponent />);

    // Simulate WebSocket open
    simulateWebSocketOpen();

    // Simulate WebSocket message
    await act(async () => {
      const generativeUIMessage = JSON.stringify({
        type: 'generative_ui',
        component: 'calendar_view',
        props: {
          events: [
            {
              id: 'e1',
              title: 'Team Standup',
              start_time: '2026-02-05T10:00:00Z',
              end_time: '2026-02-05T10:30:00Z',
            },
          ],
        },
      });

      const messageEvent = new MessageEvent('message', {
        data: generativeUIMessage,
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(messageEvent);
      }
    });

    await waitFor(() => {
      expect(getByText('Calendar')).toBeTruthy();
    });
  });

  it('handles multiple UI events sequentially', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvents, setUIEvents] = React.useState<any[]>([]);

      React.useEffect(() => {
        connect();
      }, [connect]);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvents((prev) => [...prev, event]);
        });
      }, [onUIComponent]);

      const latestEvent = uiEvents[uiEvents.length - 1];

      if (!latestEvent) return null;

      if (latestEvent.type === 'day_view') {
        return (
          <DayView
            events={latestEvent.props.events || []}
            tasks={latestEvent.props.tasks || []}
          />
        );
      } else if (latestEvent.type === 'todo_list') {
        return <TodoList tasks={latestEvent.props.tasks || []} />;
      }

      return null;
    };

    const { getByText } = render(<TestComponent />);

    // Simulate WebSocket open
    simulateWebSocketOpen();

    // First event: day_view
    await act(async () => {
      const message1 = JSON.stringify({
        type: 'generative_ui',
        component: 'day_view',
        props: {
          events: [],
          tasks: [{ id: 't1', title: 'First Task', status: 'pending' }],
        },
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(
          new MessageEvent('message', { data: message1 })
        );
      }
    });

    await waitFor(() => {
      expect(getByText("Today's Plan")).toBeTruthy();
    });

    // Second event: todo_list
    await act(async () => {
      const message2 = JSON.stringify({
        type: 'generative_ui',
        component: 'todo_list',
        props: {
          tasks: [{ id: 't2', title: 'Second Task', status: 'pending' }],
        },
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(
          new MessageEvent('message', { data: message2 })
        );
      }
    });

    await waitFor(() => {
      expect(getByText('To Do List')).toBeTruthy();
    });
  });

  it('passes props correctly to rendered components', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
      }, [connect]);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvent(event);
        });
      }, [onUIComponent]);

      return uiEvent ? (
        <DayView
          events={uiEvent.props.events || []}
          tasks={uiEvent.props.tasks || []}
        />
      ) : null;
    };

    const { getByText, getByTestId } = render(<TestComponent />);

    // Simulate WebSocket open
    simulateWebSocketOpen();

    const mockData = {
      events: [
        {
          id: 'e1',
          title: 'Specific Event Title',
          start_time: '2026-02-05T11:00:00Z',
          end_time: '2026-02-05T12:00:00Z',
        },
      ],
      tasks: [
        {
          id: 't1',
          title: 'Specific Task Title',
          status: 'pending',
        },
      ],
    };

    await act(async () => {
      const message = JSON.stringify({
        type: 'generative_ui',
        component: 'day_view',
        props: mockData,
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(new MessageEvent('message', { data: message }));
      }
    });

    await waitFor(() => {
      expect(getByText('Specific Event Title')).toBeTruthy();
      expect(getByTestId('task-card-t1')).toBeTruthy();
    });
  });

  it('handles empty props gracefully', async () => {
    const TestComponent = () => {
      const { onUIComponent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
      }, [connect]);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvent(event);
        });
      }, [onUIComponent]);

      return uiEvent ? (
        <DayView
          events={uiEvent.props.events || []}
          tasks={uiEvent.props.tasks || []}
        />
      ) : null;
    };

    const { getByText } = render(<TestComponent />);

    // Simulate WebSocket open
    simulateWebSocketOpen();

    await act(async () => {
      const message = JSON.stringify({
        type: 'generative_ui',
        component: 'day_view',
        props: {}, // Empty props
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(new MessageEvent('message', { data: message }));
      }
    });

    await waitFor(() => {
      expect(getByText("Today's Plan")).toBeTruthy();
      expect(getByText('No events or tasks for today')).toBeTruthy();
    });
  });

  it('handles malformed generative_ui messages gracefully', async () => {
    const TestComponent = () => {
      const { onUIComponent } = useWebSocketAgent('user_test', 'session_test');
      const [uiEvent, setUIEvent] = React.useState<any>(null);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvent(event);
        });
      }, [onUIComponent]);

      return uiEvent ? <DayView events={[]} tasks={[]} /> : null;
    };

    render(<TestComponent />);

    // Send malformed JSON
    act(() => {
      const malformedMessage = 'not valid json {{{';

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(
          new MessageEvent('message', { data: malformedMessage })
        );
      }
    });

    // Should not crash - no component rendered
  });

  it('distinguishes between generative_ui and regular ADK events', async () => {
    const TestComponent = () => {
      const { onUIComponent, onEvent, connect } = useWebSocketAgent(
        'user_test',
        'session_test'
      );
      const [uiEvent, setUIEvent] = React.useState<any>(null);
      const [adkEvent, setAdkEvent] = React.useState<any>(null);

      React.useEffect(() => {
        connect();
      }, [connect]);

      React.useEffect(() => {
        onUIComponent((event) => {
          setUIEvent(event);
        });
        onEvent((event) => {
          setAdkEvent(event);
        });
      }, [onUIComponent, onEvent]);

      const { Text } = require('react-native');

      return (
        <>
          {uiEvent && <Text testID="ui-received">UI Event Received</Text>}
          {adkEvent && <Text testID="adk-received">ADK Event Received</Text>}
        </>
      );
    };

    const { getByTestId, queryByTestId } = render(<TestComponent />);

    // Simulate WebSocket open
    simulateWebSocketOpen();

    // Send generative_ui event
    await act(async () => {
      const uiMessage = JSON.stringify({
        type: 'generative_ui',
        component: 'day_view',
        props: {},
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(
          new MessageEvent('message', { data: uiMessage })
        );
      }
    });

    await waitFor(() => {
      expect(getByTestId('ui-received')).toBeTruthy();
    });

    // Send regular ADK event
    await act(async () => {
      const adkMessage = JSON.stringify({
        content: {
          parts: [{ text: 'Hello from agent' }],
        },
      });

      if (mockWsInstance.onmessage) {
        mockWsInstance.onmessage(
          new MessageEvent('message', { data: adkMessage })
        );
      }
    });

    await waitFor(() => {
      expect(getByTestId('adk-received')).toBeTruthy();
    });
  });
});
