import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { TaskCardProps } from "@/types/generativeUI.types";

/**
 * TaskCard - Single task with schedule/complete actions
 */
export function TaskCard({ task }: TaskCardProps) {
  const isCompleted = task.status === "completed";

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
          <Text style={styles.due}>Due: {task.due.split("T")[0]}</Text>
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
    backgroundColor: "#252525",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  completed: {
    opacity: 0.6,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  goalBadge: {
    marginRight: 6,
  },
  title: {
    fontSize: 15,
    color: "#fff",
    flex: 1,
  },
  completedText: {
    textDecorationLine: "line-through",
    color: "#888",
  },
  notes: {
    fontSize: 13,
    color: "#888",
    marginTop: 4,
  },
  due: {
    fontSize: 12,
    color: "#4A90D9",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#333",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  completeButton: {
    backgroundColor: "#2a5a2a",
  },
  actionText: {
    color: "#fff",
    fontSize: 13,
  },
});
