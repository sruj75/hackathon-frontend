import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { DayViewProps } from '@/types/generativeUI.types';
import { TaskCard } from './TaskCard';

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
              <TaskCard key={task.id} task={task} />
            ))}
          </View>
        )}

        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              ✅ Done ({completedTasks.length})
            </Text>
            {completedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
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
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  timeline: {
    maxHeight: 400,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  eventCard: {
    backgroundColor: '#1e2838',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90D9',
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  eventTime: {
    fontSize: 12,
    color: '#60A5FA',
    marginBottom: 6,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
    lineHeight: 22,
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
