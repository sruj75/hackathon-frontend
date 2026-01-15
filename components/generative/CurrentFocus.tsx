import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CurrentFocusProps } from "@/types/generativeUI.types";

/**
 * CurrentFocus - "Now" card showing current/next event
 */
export function CurrentFocus({ event, next_event }: CurrentFocusProps) {
  if (!event && !next_event) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Now</Text>
        <Text style={styles.freeText}>
          You're free! What would you like to work on?
        </Text>
      </View>
    );
  }

  const current = event || next_event;
  const isCurrent = !!event;

  return (
    <View style={[styles.container, isCurrent && styles.active]}>
      <Text style={styles.label}>{isCurrent ? "Now" : "Up Next"}</Text>
      <Text style={styles.title}>{current?.title}</Text>
      <Text style={styles.time}>
        {formatTime(current?.start_time || "")} -{" "}
        {formatTime(current?.end_time || "")}
      </Text>
    </View>
  );
}

function formatTime(isoString: string): string {
  if (!isoString) return "";
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
  active: {
    borderWidth: 2,
    borderColor: "#4CAF50",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  time: {
    fontSize: 14,
    color: "#4A90D9",
  },
  freeText: {
    fontSize: 15,
    color: "#ccc",
  },
});
