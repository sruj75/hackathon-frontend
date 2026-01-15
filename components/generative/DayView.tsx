import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { DayViewProps, CalendarEvent, Task } from "@/types/generativeUI.types";
import { TaskCard } from "./TaskCard";

/**
 * DayView - Unified timeline showing today's schedule + pending tasks
 */
export function DayView({ events, tasks }: DayViewProps) {
  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const completedTasks = tasks.filter((t) => t.status === "completed");

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
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  header: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  timeline: {
    maxHeight: 300,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#888",
    marginBottom: 8,
  },
  eventCard: {
    backgroundColor: "#252525",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4A90D9",
  },
  eventTime: {
    fontSize: 12,
    color: "#4A90D9",
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 15,
    color: "#fff",
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
    marginTop: 20,
  },
});
