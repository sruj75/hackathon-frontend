import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { DayView } from '@/components/generative/DayView';
import { CalendarEvent, Task } from '@/types/generativeUI.types';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

const FROZEN_NOW = new Date('2026-02-10T12:00:00.000Z');

const makeIso = (offsetMinutes: number) =>
  new Date(FROZEN_NOW.getTime() + offsetMinutes * 60_000).toISOString();

const makeEvent = (
  id: string,
  title: string,
  startOffsetMinutes: number,
  durationMinutes: number
): CalendarEvent => ({
  id,
  title,
  start_time: makeIso(startOffsetMinutes),
  end_time: makeIso(startOffsetMinutes + durationMinutes),
});

describe('DayView - deterministic rendering', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FROZEN_NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const events: CalendarEvent[] = [
    makeEvent('event-1', 'Morning Planning', 90, 30),
    makeEvent('event-2', 'Team Meeting', 240, 60),
  ];

  const tasks: Task[] = [
    { id: 'task-1', title: 'Write report', status: 'pending' },
    { id: 'task-2', title: 'Review PR', status: 'pending' },
    { id: 'task-3', title: 'Update docs', status: 'completed' },
  ];

  describe('Planning Mode', () => {
    it('renders planning view with events and tasks', () => {
      const { getByText } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="planning"
        />
      );

      expect(getByText('Today')).toBeTruthy();
      expect(getByText('SCHEDULED')).toBeTruthy();
      expect(getByText('Morning Planning')).toBeTruthy();
      expect(getByText('TO DO')).toBeTruthy();
      expect(getByText('Write report')).toBeTruthy();
    });

    it('shows truncation hint when more items exist', () => {
      const manyTasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: 'pending' as const,
      }));

      const { getByText } = render(
        <DayView
          events={events}
          tasks={manyTasks}
          display_mode="planning"
        />
      );

      expect(getByText('+5 more')).toBeTruthy();
    });

    it('shows urgency signals in planning mode', () => {
      const { getByText } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="planning"
          urgency_signals={{
            overdue_count: 3,
            at_risk_events: [],
          }}
        />
      );

      expect(getByText('3')).toBeTruthy();
    });

    it('shows empty state when there are no events and no tasks', () => {
      const { getByText } = render(
        <DayView
          events={[]}
          tasks={[]}
          display_mode="planning"
        />
      );

      expect(getByText('No events or tasks for today yet')).toBeTruthy();
    });

    it('expands events list and compresses tasks when events overflow hint is pressed', () => {
      const manyEvents = Array.from({ length: 10 }, (_, i) =>
        makeEvent(`event-${i}`, `Event ${i}`, (i + 1) * 20, 15)
      );
      const manyTasks: Task[] = [
        { id: 't1', title: 'Task 1', status: 'pending' },
        { id: 't2', title: 'Task 2', status: 'pending' },
        { id: 't3', title: 'Task 3', status: 'pending' },
      ];

      const { getByText, queryByText } = render(
        <DayView
          events={manyEvents}
          tasks={manyTasks}
          display_mode="planning"
        />
      );

      expect(getByText('Task 2')).toBeTruthy();
      fireEvent.press(getByText('+5 more'));

      expect(getByText('Event 7')).toBeTruthy();
      expect(queryByText('Task 2')).toBeNull();
    });

    it('expands tasks list and compresses events when task overflow hint is pressed', () => {
      const someEvents = [
        makeEvent('e1', 'Event 1', 30, 15),
        makeEvent('e2', 'Event 2', 60, 15),
        makeEvent('e3', 'Event 3', 90, 15),
      ];
      const manyTasks = Array.from({ length: 9 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        status: 'pending' as const,
      }));

      const { getByText, queryByText } = render(
        <DayView
          events={someEvents}
          tasks={manyTasks}
          display_mode="planning"
        />
      );

      expect(getByText('Event 2')).toBeTruthy();
      fireEvent.press(getByText('+4 more'));

      expect(getByText('Task 5')).toBeTruthy();
      expect(queryByText('Event 2')).toBeNull();

      fireEvent.press(getByText('+3 more'));
      expect(queryByText('Task 5')).toBeNull();
      expect(getByText('+4 more')).toBeTruthy();
    });

    it('shows focus mode metadata and priority label when provided', () => {
      const { getByText } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="planning"
          focus_mode={{
            relevant_tasks: [{ id: 'focus-1', title: 'Deep Work', status: 'pending' }],
            why_these: 'Highest leverage right now',
          }}
        />
      );

      expect(getByText('PRIORITIES')).toBeTruthy();
      expect(getByText('Deep Work')).toBeTruthy();
      expect(getByText('Highest leverage right now')).toBeTruthy();
    });
  });

  describe('Now Focus Mode', () => {
    it('renders now focus view with current block', () => {
      const { getByText, getAllByText } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="now_focus"
          current_block={{
            event: events[0],
            time_left_minutes: 15,
            progress_percent: 50,
          }}
        />
      );

      expect(getByText('NOW')).toBeTruthy();
      expect(getAllByText('Morning Planning').length).toBeGreaterThan(0);
      expect(getByText('15 min left')).toBeTruthy();
      expect(getByText('NEXT')).toBeTruthy();
      expect(getByText('Team Meeting')).toBeTruthy();
    });

    it('shows focused tasks in now focus mode', () => {
      const { getByText } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="now_focus"
          current_block={{
            event: events[0],
            time_left_minutes: 15,
            progress_percent: 50,
          }}
        />
      );

      expect(getByText('FOCUS ON')).toBeTruthy();
      expect(getByText('Write report')).toBeTruthy();
      expect(getByText('Review PR')).toBeTruthy();
    });

    it('shows empty state when no current block, no next event, and no tasks', () => {
      const { getByText } = render(
        <DayView
          events={[]}
          tasks={[]}
          display_mode="now_focus"
        />
      );

      expect(getByText('No active block or pending tasks yet')).toBeTruthy();
    });
  });

  describe('Transition Mode', () => {
    it('renders transition view with completed and next event', () => {
      const pastEvent: CalendarEvent = makeEvent('event-past', 'Past Meeting', -240, 60);
      const futureEvents: CalendarEvent[] = [
        makeEvent('event-future-1', 'Morning Planning', 90, 30),
        makeEvent('event-future-2', 'Team Meeting', 240, 60),
      ];

      const { getByText } = render(
        <DayView
          events={[pastEvent, ...futureEvents]}
          tasks={[]}
          display_mode="transition"
        />
      );

      expect(getByText('JUST FINISHED')).toBeTruthy();
      expect(getByText('Past Meeting')).toBeTruthy();
      expect(getByText('UP NEXT')).toBeTruthy();
      expect(getByText('Morning Planning')).toBeTruthy();
    });

    it('shows next check-in in transition mode', () => {
      const { getByText } = render(
        <DayView
          events={events}
          tasks={[]}
          display_mode="transition"
          next_checkin={{
            time: makeIso(120),
            reason: 'End of work block',
          }}
        />
      );

      expect(getByText(/Next check-in:/)).toBeTruthy();
      expect(getByText(/End of work block/)).toBeTruthy();
    });

    it('shows clear state when there is no next event and no check-in', () => {
      const { getByText } = render(
        <DayView
          events={[]}
          tasks={[]}
          display_mode="transition"
        />
      );

      expect(getByText('All clear ahead')).toBeTruthy();
    });
  });

  describe('Recap Mode', () => {
    it('renders recap view with completed tasks', () => {
      const { getByText } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="recap"
        />
      );

      expect(getByText('Day Complete')).toBeTruthy();
      expect(getByText('1 tasks done • 2 events')).toBeTruthy();
      expect(getByText('ACCOMPLISHED')).toBeTruthy();
      expect(getByText('Update docs')).toBeTruthy();
    });

    it('shows empty state when no tasks completed', () => {
      const { getByText } = render(
        <DayView
          events={events}
          tasks={tasks.filter((t) => t.status === 'pending')}
          display_mode="recap"
        />
      );

      expect(getByText('No tasks completed today')).toBeTruthy();
    });

    it('expands recap tasks when overflow hint is pressed', () => {
      const completedTasks: Task[] = Array.from({ length: 12 }, (_, i) => ({
        id: `done-${i}`,
        title: `Done ${i}`,
        status: 'completed',
      }));

      const { getByText } = render(
        <DayView
          events={events}
          tasks={completedTasks}
          display_mode="recap"
        />
      );

      expect(getByText('+2 more')).toBeTruthy();
      fireEvent.press(getByText('+2 more'));
      expect(getByText('+6 more')).toBeTruthy();
    });
  });

  describe('Real Estate Management', () => {
    it('limits items per mode to fit screen', () => {
      const manyEvents = Array.from({ length: 10 }, (_, i) =>
        makeEvent(`event-${i}`, `Event ${i}`, (i + 1) * 30, 25)
      );

      const { queryByText } = render(
        <DayView
          events={manyEvents}
          tasks={[]}
          display_mode="planning"
        />
      );

      expect(queryByText('Event 0')).toBeTruthy();
      expect(queryByText('Event 4')).toBeTruthy();
      expect(queryByText('+5 more')).toBeTruthy();
    });

    it('adapts limits based on display mode', () => {
      const { queryByText: queryPlanning } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="planning"
        />
      );

      expect(queryPlanning('Write report')).toBeTruthy();
      expect(queryPlanning('Review PR')).toBeTruthy();

      const { queryByText: queryTransition } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="transition"
        />
      );

      expect(queryTransition('Write report')).toBeNull();
    });
  });

  describe('Invalid Data Handling', () => {
    it('handles invalid timestamps gracefully', () => {
      const { getByText } = render(
        <DayView
          events={[
            {
              id: 'bad-time',
              title: 'Broken event',
              start_time: 'invalid',
              end_time: 'invalid',
            },
          ]}
          tasks={[]}
          display_mode="planning"
        />
      );

      expect(getByText('Today')).toBeTruthy();
    });

    it('guards against Date constructor throws when parsing event timestamps', () => {
      const RealDate = Date;
      class ThrowingDate extends RealDate {
        constructor(value?: string | number | Date) {
          if (value === 'throw-date') {
            throw new Error('date_parse_failure');
          }
          super(value as any);
        }
      }

      (global as any).Date = ThrowingDate;
      try {
        const { getByText } = render(
          <DayView
            events={[
              {
                id: 'throwing-date-event',
                title: 'Should be dropped',
                start_time: 'throw-date',
                end_time: 'throw-date',
              },
            ]}
            tasks={[]}
            display_mode="planning"
          />
        );

        expect(getByText('No events or tasks for today yet')).toBeTruthy();
      } finally {
        (global as any).Date = RealDate;
      }
    });

    it('falls back to raw timestamp when time formatting throws', () => {
      const toLocaleTimeStringSpy = jest
        .spyOn(Date.prototype, 'toLocaleTimeString')
        .mockImplementation(() => {
          throw new Error('format_failed');
        });

      const rawStart = makeIso(30);
      const rawEnd = makeIso(60);

      const { getByText } = render(
        <DayView
          events={[
            {
              id: 'event-raw-time',
              title: 'Raw Time Event',
              start_time: rawStart,
              end_time: rawEnd,
            },
          ]}
          tasks={[]}
          display_mode="planning"
        />
      );

      expect(getByText(`${rawStart} - ${rawEnd}`)).toBeTruthy();
      toLocaleTimeStringSpy.mockRestore();
    });

    it('renders event descriptions and task metadata fields', () => {
      const describedEvent: CalendarEvent = {
        id: 'event-desc',
        title: 'Described Event',
        start_time: makeIso(30),
        end_time: makeIso(60),
        description: 'Important context',
      };
      const richTask: Task = {
        id: 'task-rich',
        title: 'Rich Task',
        status: 'pending',
        notes: 'Task notes',
        due: '2026-02-11T09:00:00Z',
        is_goal_linked: true,
      };

      const { getByText } = render(
        <DayView
          events={[describedEvent]}
          tasks={[richTask]}
          display_mode="planning"
        />
      );

      expect(getByText('Important context')).toBeTruthy();
      expect(getByText('🎯')).toBeTruthy();
      expect(getByText('Task notes')).toBeTruthy();
      expect(getByText('Due: 2026-02-11')).toBeTruthy();
    });
  });
});
