import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { DayViewProps } from '@/types/generativeUI.types';

/**
 * DayView - Unified timeline showing today's schedule + pending tasks
 */
export function DayView({ events, tasks }: DayViewProps) {
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Today's Plan</Text>

      {/* Timeline */}
      <ScrollView style={styles.timeline}>
        {events.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Scheduled</Text>
            {events.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <Text style={styles.eventTime}>
                  {formatTime(event.start_time)} - {formatTime(event.end_time)}
                </Text>
                <Text style={styles.eventTitle}>{event.title}</Text>
              </View>
            ))}
          </View>
        )}

        {pendingTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              📋 To Do ({pendingTasks.length})
            </Text>
            {pendingTasks.map((task) => (
              <View key={task.id} style={styles.taskCard}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                {task.notes && (
                  <Text style={styles.taskNotes}>{task.notes}</Text>
                )}
                {task.is_goal_linked && (
                  <Text style={styles.goalBadge}>🎯 Goal-linked</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              ✅ Done ({completedTasks.length})
            </Text>
            {completedTasks.map((task) => (
              <View
                key={task.id}
                style={[styles.taskCard, styles.completedTask]}
              >
                <Text style={[styles.taskTitle, styles.completedText]}>
                  {task.title}
                </Text>
                {task.notes && (
                  <Text style={[styles.taskNotes, styles.completedText]}>
                    {task.notes}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {events.length === 0 && tasks.length === 0 && (
          <Text style={styles.emptyText}>No events or tasks for today</Text>
        )}
      </ScrollView>
    </View>
  );
}

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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 3,
  },
  header: {
    fontSize: 19,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  timeline: {
    maxHeight: 520,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  eventCard: {
    backgroundColor: '#1e2838',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90D9',
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
    elevation: 2,
  },
  eventTime: {
    fontSize: 11,
    color: '#60A5FA',
    marginBottom: 4,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 19,
  },
  taskCard: {
    backgroundColor: '#1e2838',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
    elevation: 2,
  },
  taskTitle: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: 2,
  },
  taskNotes: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
    marginTop: 2,
  },
  goalBadge: {
    fontSize: 10,
    color: '#FBBF24',
    fontWeight: '600',
    marginTop: 6,
  },
  completedTask: {
    opacity: 0.6,
    borderLeftColor: '#6B7280',
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 24,
    fontSize: 13,
    fontStyle: 'italic',
  },
});
