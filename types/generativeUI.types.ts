/**
 * Generative UI Types for Daily Planner
 *
 * These types define the structure of UI components that the agent can "inflate"
 * on the frontend via tool calls.
 */

// Component type union (strict allowlist of 8 components)
export type GenerativeUIType =
  | 'day_view'
  | 'task_card'
  | 'time_slots'
  | 'schedule_picker'
  | 'goal_progress'
  | 'day_summary'
  | 'confirmation'
  | 'current_focus';

// Base event structure
export interface GenerativeUIEvent {
  id: string;
  type: GenerativeUIType;
  props: GenerativeUIProps;
  timestamp: number;
  dismissed?: boolean;
}

// Union of all component props
export type GenerativeUIProps =
  | DayViewProps
  | TimeSlotsProps
  | SchedulePickerProps
  | GoalProgressProps
  | DaySummaryProps
  | ConfirmationProps
  | CurrentFocusProps;

// ============================================
// Shared Types
// ============================================

export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'pending' | 'completed';
  is_goal_linked?: boolean;
}

export interface TimeSlot {
  start: string;
  end: string;
  duration_minutes: number;
}

// ============================================
// Component Props
// ============================================

// Display modes - agent must choose based on context
export type DisplayMode = 'now_focus' | 'planning' | 'transition' | 'recap';

// 1. DayView - Enhanced unified executive control panel with smart real estate management
export interface DayViewProps {
  // Core data (always present)
  events: CalendarEvent[];
  tasks: Task[];

  // Display mode (REQUIRED - agent decides based on context)
  display_mode: DisplayMode;

  // Contextual intelligence (optional - progressive enhancement)
  current_block?: {
    event: CalendarEvent;
    time_left_minutes: number;
    progress_percent: number;
  };

  next_checkin?: {
    time: string;
    reason: string;
  };

  focus_mode?: {
    relevant_tasks: Task[]; // Only 3-5 for current block
    why_these: string; // "These match your current deep work block"
  };

  urgency_signals?: {
    overdue_count: number;
    at_risk_events: string[];
  };
}

// 2. TimeSlots - Available slots display
export interface TimeSlotsProps {
  slots: TimeSlot[];
}

// 3. SchedulePicker - Time selection for a task
export interface SchedulePickerProps {
  task: Task;
  slots: TimeSlot[];
}

// 4. GoalProgress - Visual progress toward goals
export interface GoalProgressProps {
  percentage: number;
  summary: string;
  completed: Task[];
  pending: Task[];
}

// 5. DaySummary - End-of-day recap
export interface DaySummaryProps {
  completed: Task[];
  pending: Task[];
  events_count: number;
}

// 6. Confirmation - Action confirmation
export interface ConfirmationProps {
  action: string;
  details: string;
}

// 7. CurrentFocus - "Now" card
export interface CurrentFocusProps {
  event?: CalendarEvent;
  next_event?: CalendarEvent;
}
