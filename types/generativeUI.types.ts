/**
 * Generative UI Types for Daily Planner
 *
 * These types define the structure of UI components that the agent can "inflate"
 * on the frontend via tool calls.
 */

// Component type union (2 components)
export type GenerativeUIType =
  | "day_view"
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

// ============================================
// Component Props
// ============================================

// 1. DayView - Unified timeline showing events and tasks
export interface DayViewProps {
  events: CalendarEvent[];
  tasks: Task[];
}

// 2. StopReflectAct - Emotional regulation wizard
export interface StopReflectActProps {
  phase: 'stop' | 'reflect' | 'act';
  title: string;
  prompt?: string; // Optional - phase-specific content is now hardcoded in component
  action_items?: string[];
}
