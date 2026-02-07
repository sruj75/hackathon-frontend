import React from 'react';
import { render } from '@testing-library/react-native';

import { DayView } from '@/components/generative/DayView';
import { CalendarEvent, Task } from '@/types/generativeUI.types';

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: any) => {
    const { View } = require('react-native');
    return <View {...props}>{children}</View>;
  },
}));

describe('DayView - Apple-Minimal Generative UI', () => {
  const events: CalendarEvent[] = [
    {
      id: 'event-1',
      title: 'Morning Planning',
      start_time: '2026-12-07T14:30:00Z', // Future date
      end_time: '2026-12-07T15:00:00Z',
    },
    {
      id: 'event-2',
      title: 'Team Meeting',
      start_time: '2026-12-07T19:30:00Z', // Future date, later in day
      end_time: '2026-12-07T20:30:00Z',
    },
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

      // Planning mode shows 5 tasks, so should see +5 more
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

      expect(getByText('3')).toBeTruthy(); // Urgency badge
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
      // Now focus mode shows max 3 tasks
      expect(getByText('Write report')).toBeTruthy();
      expect(getByText('Review PR')).toBeTruthy();
    });
  });

  describe('Transition Mode', () => {
    it('renders transition view with completed and next event', () => {
      const pastEvent: CalendarEvent = {
        id: 'event-past',
        title: 'Past Meeting',
        start_time: '2026-02-07T08:00:00Z', // Past (before today)
        end_time: '2026-02-07T09:00:00Z',
      };

      const futureEvents: CalendarEvent[] = [
        {
          id: 'event-future-1',
          title: 'Morning Planning',
          start_time: '2026-12-08T14:30:00Z', // Future
          end_time: '2026-12-08T15:00:00Z',
        },
        {
          id: 'event-future-2',
          title: 'Team Meeting',
          start_time: '2026-12-08T19:30:00Z', // Future, later
          end_time: '2026-12-08T20:30:00Z',
        },
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
            time: '2026-02-07T10:00:00Z',
            reason: 'End of work block',
          }}
        />
      );

      expect(getByText(/Next check-in:/)).toBeTruthy();
      expect(getByText(/End of work block/)).toBeTruthy();
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
  });

  describe('Real Estate Management', () => {
    it('limits items per mode to fit screen', () => {
      const manyEvents = Array.from({ length: 10 }, (_, i) => ({
        id: `event-${i}`,
        title: `Event ${i}`,
        start_time: `2027-02-07T${10 + i}:00:00Z`, // Future year
        end_time: `2027-02-07T${11 + i}:00:00Z`,
      }));

      const { queryByText } = render(
        <DayView
          events={manyEvents}
          tasks={[]}
          display_mode="planning"
        />
      );

      // Planning mode shows max 5 events
      expect(queryByText('Event 0')).toBeTruthy();
      expect(queryByText('Event 4')).toBeTruthy();
      // Event 5 onwards should show as "+X more"
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

      // Planning shows multiple tasks
      expect(queryPlanning('Write report')).toBeTruthy();
      expect(queryPlanning('Review PR')).toBeTruthy();

      const { queryByText: queryTransition } = render(
        <DayView
          events={events}
          tasks={tasks}
          display_mode="transition"
        />
      );

      // Transition shows no tasks section
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

      // Should render without crashing
      expect(getByText('Today')).toBeTruthy();
    });
  });
});
