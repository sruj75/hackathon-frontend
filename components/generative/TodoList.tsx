import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Task } from '@/types/generativeUI.types';
import { TaskCard } from './TaskCard';

interface TodoListProps {
  tasks: Task[];
}

/**
 * TodoList - Dedicated view for tasks
 */
export function TodoList({ tasks }: TodoListProps) {
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <View style={styles.container}>
      <Text style={styles.header}>To Do List</Text>

      <ScrollView style={styles.list}>
        {pendingTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              📋 Pending ({pendingTasks.length})
            </Text>
            {pendingTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </View>
        )}

        {completedTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              ✅ Completed ({completedTasks.length})
            </Text>
            {completedTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </View>
        )}

        {tasks.length === 0 && (
          <Text style={styles.emptyText}>No tasks found</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    flex: 1,
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
  list: {
    flex: 1,
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
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
