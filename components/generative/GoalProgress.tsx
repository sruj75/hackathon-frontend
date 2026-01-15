import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { GoalProgressProps } from "@/types/generativeUI.types";

/**
 * GoalProgress - Visual progress toward goals
 */
export function GoalProgress({
  percentage,
  summary,
  completed,
  pending,
}: GoalProgressProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>🎯 Goal Progress</Text>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(percentage, 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.percentage}>{percentage}%</Text>
      </View>

      {/* Summary */}
      <Text style={styles.summary}>{summary}</Text>

      {/* Stats */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{completed.length}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{pending.length}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
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
    borderWidth: 1,
    borderColor: "#2a5a2a",
  },
  header: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#333",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4CAF50",
    borderRadius: 4,
  },
  percentage: {
    color: "#4CAF50",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 12,
    minWidth: 45,
    textAlign: "right",
  },
  summary: {
    fontSize: 14,
    color: "#ccc",
    marginBottom: 12,
  },
  stats: {
    flexDirection: "row",
    gap: 24,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "600",
    color: "#fff",
  },
  statLabel: {
    fontSize: 12,
    color: "#888",
  },
});
