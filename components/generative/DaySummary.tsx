import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { DaySummaryProps } from "@/types/generativeUI.types";

/**
 * DaySummary - End-of-day recap + goal check
 */
export function DaySummary({
  completed,
  pending,
  events_count,
}: DaySummaryProps) {
  const totalTasks = completed.length + pending.length;
  const completionRate =
    totalTasks > 0 ? Math.round((completed.length / totalTasks) * 100) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>📊 Day Summary</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{completed.length}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{pending.length}</Text>
          <Text style={styles.statLabel}>Remaining</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{events_count}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${completionRate}%` }]}
          />
        </View>
        <Text style={styles.progressText}>{completionRate}% complete</Text>
      </View>
    </View>
  );
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
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#252525",
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  progressContainer: {
    alignItems: "center",
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: "#333",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4A90D9",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    color: "#888",
    marginTop: 8,
  },
});
