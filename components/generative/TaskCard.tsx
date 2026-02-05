import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TaskCardProps } from '@/types/generativeUI.types';

/**
 * TaskCard - Single task with schedule/complete actions
 */
export function TaskCard({ task }: TaskCardProps) {
  const isCompleted = task.status === 'completed';

  return (
    <View style={[styles.container, isCompleted && styles.completed]}>
      <View style={styles.content}>
        <View style={styles.header}>
          {task.is_goal_linked && <Text style={styles.goalBadge}>🎯</Text>}
          <Text style={[styles.title, isCompleted && styles.completedText]}>
            {task.title}
          </Text>
        </View>
        {task.notes && (
          <Text style={styles.notes} numberOfLines={2}>
            {task.notes}
          </Text>
        )}
        {task.due && (
          <Text style={styles.due}>Due: {task.due.split('T')[0]}</Text>
        )}
      </View>

      {!isCompleted && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionText}>Schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.completeButton]}
          >
            <Text style={styles.actionText}>✓</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e2838',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  completed: {
    opacity: 0.5,
    borderLeftColor: '#4B5563',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  goalBadge: {
    marginRight: 8,
    fontSize: 16,
  },
  title: {
    fontSize: 15,
    color: '#fff',
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  notes: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 6,
    lineHeight: 18,
  },
  due: {
    fontSize: 11,
    color: '#60A5FA',
    marginTop: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4B5563',
  },
  completeButton: {
    backgroundColor: '#166534',
    borderColor: '#22C55E',
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
