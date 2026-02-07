import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  DayViewProps,
  Task,
  CalendarEvent,
  DisplayMode,
} from '@/types/generativeUI.types';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * DayView - Apple-minimal generative UI with smart real estate management
 *
 * Philosophy: Zero scrolling, focused views, reactive expansion
 * - Each display_mode fits perfectly in available space (~520px)
 * - Truncation with hints (+X more) for overflow
 * - Tap to expand one section, others auto-collapse
 * - No loaders, instant transitions
 */

// Item limits per display mode (ensures content fits in 520px available space)
const DISPLAY_MODE_LIMITS: Record<
  DisplayMode,
  { events: number; tasks: number }
> = {
  now_focus: { events: 1, tasks: 3 }, // Current block + next + top tasks
  planning: { events: 5, tasks: 5 }, // Morning overview
  transition: { events: 2, tasks: 0 }, // What just ended + what's next
  recap: { events: 0, tasks: 10 }, // Evening review of what got done
};

type ExpandableSection = 'events' | 'tasks' | null;

export function DayView({
  events,
  tasks,
  display_mode,
  current_block,
  next_checkin,
  focus_mode,
  urgency_signals,
}: DayViewProps) {
  // Expansion state - only one section can be expanded at a time
  const [expandedSection, setExpandedSection] =
    useState<ExpandableSection>(null);

  // Categorize tasks
  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status === 'pending'),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((t) => t.status === 'completed'),
    [tasks]
  );

  // Determine which tasks to show based on mode and focus
  const displayTasks = useMemo(() => {
    if (display_mode === 'recap') {
      return completedTasks; // Show what got done
    }
    return focus_mode ? focus_mode.relevant_tasks : pendingTasks;
  }, [display_mode, focus_mode, pendingTasks, completedTasks]);

  // Memoize current time to avoid useMemo dependency issues
  const now = useMemo(() => new Date(), []);

  // Separate current/upcoming/past events
  const { currentEvent, upcomingEvents, pastEvents } = useMemo(() => {
    const current = events.find((e) => {
      try {
        const start = new Date(e.start_time);
        const end = new Date(e.end_time);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
        return now >= start && now <= end;
      } catch {
        return false;
      }
    });

    const upcoming = events.filter((e) => {
      try {
        const start = new Date(e.start_time);
        if (isNaN(start.getTime())) return false;
        return start > now;
      } catch {
        return false;
      }
    });

    const past = events.filter((e) => {
      try {
        const end = new Date(e.end_time);
        if (isNaN(end.getTime())) return false;
        return end < now;
      } catch {
        return false;
      }
    });

    return {
      currentEvent: current,
      upcomingEvents: upcoming,
      pastEvents: past,
    };
  }, [events, now]);

  // Calculate item limits based on mode and expansion
  const itemLimits = useMemo(() => {
    const baseLimits = DISPLAY_MODE_LIMITS[display_mode];

    if (expandedSection === 'events') {
      // Expand events, compress tasks
      return {
        events: Math.min(upcomingEvents.length, 8),
        tasks: 1,
      };
    } else if (expandedSection === 'tasks') {
      // Expand tasks, compress events
      return {
        events: 1,
        tasks: Math.min(displayTasks.length, 6),
      };
    }

    return baseLimits;
  }, [
    display_mode,
    expandedSection,
    upcomingEvents.length,
    displayTasks.length,
  ]);

  // Toggle expansion
  const toggleExpansion = (section: 'events' | 'tasks') => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  // Header with date
  const dateString = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  // Render based on display mode
  return (
    <View style={styles.container}>
      {/* Minimal header */}
      <View style={styles.headerRow}>
        <Text style={styles.header}>
          {display_mode === 'recap' ? 'Today' : 'Today'}
        </Text>
        <Text style={styles.headerDate}>{dateString}</Text>
      </View>

      {/* Content - NO ScrollView, everything fits */}
      <View style={styles.content}>
        {/* NOW FOCUS Mode */}
        {display_mode === 'now_focus' && (
          <NowFocusView
            currentBlock={current_block}
            currentEvent={currentEvent}
            nextEvent={
              current_block && upcomingEvents[0]?.id === current_block.event.id
                ? upcomingEvents[1]
                : upcomingEvents[0]
            }
            tasks={displayTasks.slice(0, itemLimits.tasks)}
            tasksOverflow={displayTasks.length - itemLimits.tasks}
            onExpandTasks={() => toggleExpansion('tasks')}
            urgencySignals={urgency_signals}
          />
        )}

        {/* PLANNING Mode */}
        {display_mode === 'planning' && (
          <PlanningView
            upcomingEvents={upcomingEvents.slice(0, itemLimits.events)}
            eventsOverflow={upcomingEvents.length - itemLimits.events}
            onExpandEvents={() => toggleExpansion('events')}
            tasks={displayTasks.slice(0, itemLimits.tasks)}
            tasksOverflow={displayTasks.length - itemLimits.tasks}
            onExpandTasks={() => toggleExpansion('tasks')}
            focusMode={focus_mode}
            urgencySignals={urgency_signals}
          />
        )}

        {/* TRANSITION Mode */}
        {display_mode === 'transition' && (
          <TransitionView
            completedEvent={pastEvents[pastEvents.length - 1]}
            nextEvent={upcomingEvents[0]}
            nextCheckin={next_checkin}
          />
        )}

        {/* RECAP Mode */}
        {display_mode === 'recap' && (
          <RecapView
            completedTasks={completedTasks.slice(0, itemLimits.tasks)}
            tasksOverflow={completedTasks.length - itemLimits.tasks}
            onExpandTasks={() => toggleExpansion('tasks')}
            eventsCount={events.length}
          />
        )}
      </View>
    </View>
  );
}

/**
 * NOW FOCUS View - What's happening right now + immediate next
 */
function NowFocusView({
  currentBlock,
  currentEvent,
  nextEvent,
  tasks,
  tasksOverflow,
  onExpandTasks,
  urgencySignals,
}: {
  currentBlock?: DayViewProps['current_block'];
  currentEvent?: CalendarEvent;
  nextEvent?: CalendarEvent;
  tasks: Task[];
  tasksOverflow: number;
  onExpandTasks: () => void;
  urgencySignals?: DayViewProps['urgency_signals'];
}) {
  const displayEvent = currentBlock ? currentBlock.event : currentEvent;
  const isAtRisk =
    urgencySignals?.at_risk_events?.includes(displayEvent?.id || '') || false;

  return (
    <>
      {/* Current Block */}
      {displayEvent && (
        <View style={[styles.nowSection, isAtRisk && styles.nowSectionAtRisk]}>
          <Text style={styles.nowLabel}>NOW</Text>
          <Text style={styles.nowTitle}>{displayEvent.title}</Text>
          {currentBlock && (
            <>
              <Text style={styles.nowTime}>
                {currentBlock.time_left_minutes} min left
              </Text>
              <View style={styles.progressContainer}>
                <LinearGradient
                  colors={['#007AFF', '#34C759']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.progressBar,
                    { width: `${currentBlock.progress_percent}%` },
                  ]}
                />
              </View>
            </>
          )}
        </View>
      )}

      {/* Next Up */}
      {nextEvent && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NEXT</Text>
          <EventCard event={nextEvent} isPast={false} />
        </View>
      )}

      {/* Top Tasks */}
      {tasks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FOCUS ON</Text>
          {tasks.map((task) => (
            <TaskCardInline key={task.id} task={task} />
          ))}
          {tasksOverflow > 0 && (
            <TruncationHint count={tasksOverflow} onPress={onExpandTasks} />
          )}
        </View>
      )}
    </>
  );
}

/**
 * PLANNING View - Morning overview of day
 */
function PlanningView({
  upcomingEvents,
  eventsOverflow,
  onExpandEvents,
  tasks,
  tasksOverflow,
  onExpandTasks,
  focusMode,
  urgencySignals,
}: {
  upcomingEvents: CalendarEvent[];
  eventsOverflow: number;
  onExpandEvents: () => void;
  tasks: Task[];
  tasksOverflow: number;
  onExpandTasks: () => void;
  focusMode?: DayViewProps['focus_mode'];
  urgencySignals?: DayViewProps['urgency_signals'];
}) {
  return (
    <>
      {/* Timeline */}
      {upcomingEvents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SCHEDULED</Text>
          {upcomingEvents.map((event) => (
            <EventCard key={event.id} event={event} isPast={false} />
          ))}
          {eventsOverflow > 0 && (
            <TruncationHint count={eventsOverflow} onPress={onExpandEvents} />
          )}
        </View>
      )}

      {/* Tasks */}
      {tasks.length > 0 && (
        <View style={styles.section}>
          <View style={styles.taskSectionHeader}>
            <Text style={styles.sectionTitle}>
              {focusMode ? 'PRIORITIES' : 'TO DO'}
            </Text>
            {urgencySignals && urgencySignals.overdue_count > 0 && (
              <View style={styles.urgencyBadge}>
                <Text style={styles.urgencyText}>
                  {urgencySignals.overdue_count}
                </Text>
              </View>
            )}
          </View>
          {focusMode && focusMode.why_these && (
            <Text style={styles.focusHint}>{focusMode.why_these}</Text>
          )}
          {tasks.map((task) => (
            <TaskCardInline key={task.id} task={task} />
          ))}
          {tasksOverflow > 0 && (
            <TruncationHint count={tasksOverflow} onPress={onExpandTasks} />
          )}
        </View>
      )}
    </>
  );
}

/**
 * TRANSITION View - Between activities
 */
function TransitionView({
  completedEvent,
  nextEvent,
  nextCheckin,
}: {
  completedEvent?: CalendarEvent;
  nextEvent?: CalendarEvent;
  nextCheckin?: DayViewProps['next_checkin'];
}) {
  return (
    <>
      {completedEvent && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>JUST FINISHED</Text>
          <EventCard event={completedEvent} isPast={true} />
        </View>
      )}

      {nextEvent && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>UP NEXT</Text>
          <EventCard event={nextEvent} isPast={false} />
        </View>
      )}

      {nextCheckin && (
        <View style={styles.checkinHint}>
          <Text style={styles.checkinText}>
            Next check-in: {formatTime(nextCheckin.time)} • {nextCheckin.reason}
          </Text>
        </View>
      )}

      {!nextEvent && !nextCheckin && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>All clear ahead</Text>
        </View>
      )}
    </>
  );
}

/**
 * RECAP View - End of day summary
 */
function RecapView({
  completedTasks,
  tasksOverflow,
  onExpandTasks,
  eventsCount,
}: {
  completedTasks: Task[];
  tasksOverflow: number;
  onExpandTasks: () => void;
  eventsCount: number;
}) {
  return (
    <>
      <View style={styles.recapHeader}>
        <Text style={styles.recapTitle}>Day Complete</Text>
        <Text style={styles.recapSubtitle}>
          {completedTasks.length} tasks done • {eventsCount} events
        </Text>
      </View>

      {completedTasks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOMPLISHED</Text>
          {completedTasks.map((task) => (
            <TaskCardInline key={task.id} task={task} />
          ))}
          {tasksOverflow > 0 && (
            <TruncationHint count={tasksOverflow} onPress={onExpandTasks} />
          )}
        </View>
      )}

      {completedTasks.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No tasks completed today</Text>
        </View>
      )}
    </>
  );
}

/**
 * Truncation Hint - "+X more" button
 */
function TruncationHint({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.truncationHint} onPress={onPress}>
      <Text style={styles.truncationText}>+{count} more</Text>
    </TouchableOpacity>
  );
}

/**
 * Event Card - Timeline item
 */
function EventCard({
  event,
  isPast,
}: {
  event: CalendarEvent;
  isPast: boolean;
}) {
  return (
    <View style={[styles.eventCard, isPast && styles.eventCardPast]}>
      <Text style={[styles.eventTime, isPast && styles.eventTimePast]}>
        {formatTime(event.start_time)} - {formatTime(event.end_time)}
      </Text>
      <Text style={[styles.eventTitle, isPast && styles.eventTitlePast]}>
        {event.title}
      </Text>
      {event.description && (
        <Text style={styles.eventDescription} numberOfLines={1}>
          {event.description}
        </Text>
      )}
    </View>
  );
}

/**
 * Task Card Inline - Individual task
 */
function TaskCardInline({ task }: { task: Task }) {
  const isCompleted = task.status === 'completed';

  return (
    <View style={[styles.taskCard, isCompleted && styles.taskCardCompleted]}>
      <View style={styles.taskContent}>
        <View style={styles.taskHeader}>
          {task.is_goal_linked && <Text style={styles.goalBadge}>🎯</Text>}
          <Text
            style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}
          >
            {task.title}
          </Text>
        </View>
        {task.notes && (
          <Text style={styles.taskNotes} numberOfLines={2}>
            {task.notes}
          </Text>
        )}
        {task.due && (
          <Text style={styles.taskDue}>Due: {task.due.split('T')[0]}</Text>
        )}
      </View>
    </View>
  );
}

/**
 * Time formatter helper
 */
function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Apple-minimal styles with smart real estate management
 */
const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    minHeight: 400,
    maxHeight: 600, // Hard limit - content must fit
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  header: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  headerDate: {
    fontSize: 16,
    color: '#a0a0a0',
  },
  content: {
    // No ScrollView - content must fit
  },

  // Empty states
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#a0a0a0',
    fontSize: 16,
  },

  // NOW Section
  nowSection: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  nowSectionAtRisk: {
    borderLeftColor: '#FF3B30',
  },
  nowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#007AFF',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  nowTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  nowTime: {
    fontSize: 14,
    color: '#a0a0a0',
    marginBottom: 12,
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },

  // Check-in hint
  checkinHint: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  checkinText: {
    fontSize: 13,
    color: '#a0a0a0',
  },

  // Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
    letterSpacing: 1.5,
    marginBottom: 10,
  },

  // Task section header
  taskSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  urgencyBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  urgencyText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  focusHint: {
    fontSize: 12,
    color: '#a0a0a0',
    fontStyle: 'italic',
    marginBottom: 10,
    marginTop: -6,
  },

  // Truncation hint
  truncationHint: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  truncationText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },

  // Event cards
  eventCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  eventCardPast: {
    opacity: 0.5,
  },
  eventTime: {
    fontSize: 12,
    color: '#007AFF',
    marginBottom: 6,
    fontWeight: '500',
  },
  eventTimePast: {
    color: '#666666',
  },
  eventTitle: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  eventTitlePast: {
    color: '#a0a0a0',
  },
  eventDescription: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 4,
  },

  // Task cards
  taskCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  taskCardCompleted: {
    opacity: 0.6,
  },
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalBadge: {
    fontSize: 14,
    marginRight: 6,
  },
  taskTitle: {
    fontSize: 15,
    color: '#ffffff',
    flex: 1,
    fontWeight: '500',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#666666',
  },
  taskNotes: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: 6,
  },
  taskDue: {
    fontSize: 12,
    color: '#007AFF',
    marginTop: 6,
  },

  // Recap view
  recapHeader: {
    marginBottom: 20,
  },
  recapTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  recapSubtitle: {
    fontSize: 14,
    color: '#a0a0a0',
  },
});
