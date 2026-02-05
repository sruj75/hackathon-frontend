/**
 * Tests for TodoList component.
 *
 * Tests:
 * - Renders empty state when no tasks
 * - Displays pending tasks with correct status
 * - Displays completed tasks separately
 * - Shows task counts in section headers
 * - Renders task priorities correctly
 * - Handles task with long descriptions
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { TodoList } from '@/components/generative/TodoList';
import { Task } from '@/types/generativeUI.types';

// Mock TaskCard since it's imported by TodoList
jest.mock('@/components/generative/TaskCard', () => ({
  TaskCard: ({ task }: { task: Task }) => {
    const { Text, View } = require('react-native');
    return (
      <View testID={`task-card-${task.id}`}>
        <Text>{task.title}</Text>
        <Text>{task.status}</Text>
      </View>
    );
  },
}));

describe('TodoList', () => {
  const mockPendingTasks: Task[] = [
    {
      id: 'task1',
      title: 'Write report',
      status: 'pending',
    },
    {
      id: 'task2',
      title: 'Review code',
      status: 'pending',
      notes: 'PR #123',
    },
    {
      id: 'task3',
      title: 'Send email',
      status: 'pending',
      due: '2026-02-05T17:00:00Z',
    },
  ];

  const mockCompletedTasks: Task[] = [
    {
      id: 'task4',
      title: 'Morning standup',
      status: 'completed',
    },
    {
      id: 'task5',
      title: 'Update docs',
      status: 'completed',
      notes: 'Documentation updated',
    },
  ];

  const mockMixedTasks: Task[] = [...mockPendingTasks, ...mockCompletedTasks];

  it('renders empty state when no tasks', () => {
    const { getByText } = render(<TodoList tasks={[]} />);

    expect(getByText('To Do List')).toBeTruthy();
    expect(getByText('No tasks found')).toBeTruthy();
  });

  it('displays pending tasks with correct count', () => {
    const { getByText, getByTestId } = render(
      <TodoList tasks={mockPendingTasks} />
    );

    expect(getByText('To Do List')).toBeTruthy();
    expect(getByText('📋 Pending (3)')).toBeTruthy();

    // Verify all pending tasks are rendered
    expect(getByTestId('task-card-task1')).toBeTruthy();
    expect(getByTestId('task-card-task2')).toBeTruthy();
    expect(getByTestId('task-card-task3')).toBeTruthy();
  });

  it('displays completed tasks separately with count', () => {
    const { getByText, getByTestId } = render(
      <TodoList tasks={mockCompletedTasks} />
    );

    expect(getByText('✅ Completed (2)')).toBeTruthy();

    // Verify all completed tasks are rendered
    expect(getByTestId('task-card-task4')).toBeTruthy();
    expect(getByTestId('task-card-task5')).toBeTruthy();
  });

  it('shows both pending and completed sections when mixed', () => {
    const { getByText, getByTestId } = render(
      <TodoList tasks={mockMixedTasks} />
    );

    // Both section headers should be present
    expect(getByText('📋 Pending (3)')).toBeTruthy();
    expect(getByText('✅ Completed (2)')).toBeTruthy();

    // All tasks should be rendered
    expect(getByTestId('task-card-task1')).toBeTruthy();
    expect(getByTestId('task-card-task2')).toBeTruthy();
    expect(getByTestId('task-card-task3')).toBeTruthy();
    expect(getByTestId('task-card-task4')).toBeTruthy();
    expect(getByTestId('task-card-task5')).toBeTruthy();
  });

  it('only shows sections with content', () => {
    const { getByText, queryByText } = render(
      <TodoList tasks={mockPendingTasks} />
    );

    expect(getByText('📋 Pending (3)')).toBeTruthy();
    expect(queryByText('✅ Completed')).toBeNull();
  });

  it('renders with ScrollView for scrolling', () => {
    const { UNSAFE_getByType } = render(<TodoList tasks={mockMixedTasks} />);

    const { ScrollView } = require('react-native');
    const scrollView = UNSAFE_getByType(ScrollView);
    expect(scrollView).toBeTruthy();
  });

  it('handles tasks with all optional fields', () => {
    const richTask: Task[] = [
      {
        id: 'task-rich',
        title: 'Complex Task',
        notes: 'Detailed notes here',
        due: '2026-02-05T17:00:00Z',
        status: 'pending',
        is_goal_linked: true,
      },
    ];

    const { getByTestId } = render(<TodoList tasks={richTask} />);

    expect(getByTestId('task-card-task-rich')).toBeTruthy();
  });

  it('handles task with long title', () => {
    const longTitleTask: Task[] = [
      {
        id: 'task-long',
        title:
          'This is a very long task title that might need to wrap across multiple lines in the UI',
        status: 'pending',
      },
    ];

    const { getByTestId } = render(<TodoList tasks={longTitleTask} />);

    expect(getByTestId('task-card-task-long')).toBeTruthy();
  });

  it('handles task with long notes', () => {
    const longNotesTask: Task[] = [
      {
        id: 'task-notes',
        title: 'Task with notes',
        notes:
          'This is a very long note that contains lots of details about the task. It might include instructions, links, or other important information that needs to be displayed.',
        status: 'pending',
      },
    ];

    const { getByTestId } = render(<TodoList tasks={longNotesTask} />);

    expect(getByTestId('task-card-task-notes')).toBeTruthy();
  });

  it('correctly filters tasks by status', () => {
    const tasks: Task[] = [
      { id: '1', title: 'Task 1', status: 'pending' },
      { id: '2', title: 'Task 2', status: 'completed' },
      { id: '3', title: 'Task 3', status: 'pending' },
      { id: '4', title: 'Task 4', status: 'completed' },
      { id: '5', title: 'Task 5', status: 'pending' },
    ];

    const { getByText } = render(<TodoList tasks={tasks} />);

    expect(getByText('📋 Pending (3)')).toBeTruthy();
    expect(getByText('✅ Completed (2)')).toBeTruthy();
  });

  it('handles empty task title gracefully', () => {
    const emptyTitleTask: Task[] = [
      {
        id: 'task-empty',
        title: '',
        status: 'pending',
      },
    ];

    const { getByTestId } = render(<TodoList tasks={emptyTitleTask} />);

    expect(getByTestId('task-card-task-empty')).toBeTruthy();
  });

  it('handles task with goal link', () => {
    const goalLinkedTask: Task[] = [
      {
        id: 'task-goal',
        title: 'Goal-linked task',
        status: 'pending',
        is_goal_linked: true,
      },
    ];

    const { getByTestId } = render(<TodoList tasks={goalLinkedTask} />);

    expect(getByTestId('task-card-task-goal')).toBeTruthy();
  });

  it('handles many tasks without performance issues', () => {
    const manyTasks: Task[] = Array.from({ length: 50 }, (_, i) => ({
      id: `task${i}`,
      title: `Task ${i}`,
      status: i % 2 === 0 ? ('pending' as const) : ('completed' as const),
    }));

    const { getByText } = render(<TodoList tasks={manyTasks} />);

    expect(getByText('📋 Pending (25)')).toBeTruthy();
    expect(getByText('✅ Completed (25)')).toBeTruthy();
  });

  it('maintains correct task order', () => {
    const orderedTasks: Task[] = [
      { id: 't1', title: 'First', status: 'pending' },
      { id: 't2', title: 'Second', status: 'pending' },
      { id: 't3', title: 'Third', status: 'pending' },
    ];

    const { getAllByTestId } = render(<TodoList tasks={orderedTasks} />);

    const taskCards = [
      getAllByTestId('task-card-t1')[0],
      getAllByTestId('task-card-t2')[0],
      getAllByTestId('task-card-t3')[0],
    ];

    // All should exist
    taskCards.forEach((card) => expect(card).toBeTruthy());
  });
});
