/**
 * Generative UI Types for Daily Planner
 *
 * These types define the structure of UI components that the agent can "inflate"
 * on the frontend via tool calls.
 */

// Component type union (strict allowlist of 9 components)
export type GenerativeUIType =
  | "day_view"
  | "task_card"
  | "time_slots"
  | "schedule_picker"
  | "goal_progress"
  | "day_summary"
  | "confirmation"
  | "current_focus"
  | "stop_reflect_act";

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
  | TaskCardProps
  | TimeSlotsProps
  | SchedulePickerProps
  | GoalProgressProps
  | DaySummaryProps
  | ConfirmationProps
  | CurrentFocusProps
  | StopReflectActProps;

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
  status: "pending" | "completed";
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

// 1. DayView - Unified timeline
export interface DayViewProps {
  events: CalendarEvent[];
  tasks: Task[];
}

// 2. TaskCard - Single task with actions
export interface TaskCardProps {
  task: Task;
}

// 3. TimeSlots - Available slots display
export interface TimeSlotsProps {
  slots: TimeSlot[];
}

// 4. SchedulePicker - Time selection for a task
export interface SchedulePickerProps {
  task: Task;
  slots: TimeSlot[];
}

// 5. GoalProgress - Visual progress toward goals
export interface GoalProgressProps {
  percentage: number;
  summary: string;
  completed: Task[];
  pending: Task[];
}

// 6. DaySummary - End-of-day recap
export interface DaySummaryProps {
  completed: Task[];
  pending: Task[];
  events_count: number;
}

// 7. Confirmation - Action confirmation
export interface ConfirmationProps {
  action: string;
  details: string;
}

// 8. CurrentFocus - "Now" card
export interface CurrentFocusProps {
  event?: CalendarEvent;
  next_event?: CalendarEvent;
}

// 9. StopReflectAct - Emotional regulation wizard
export interface StopReflectActProps {
  phase: 'stop' | 'reflect' | 'act';
  title: string;
  prompt: string;
  action_items?: string[];
}
