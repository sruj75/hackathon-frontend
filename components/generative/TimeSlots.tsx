import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { TimeSlotsProps } from "@/types/generativeUI.types";

/**
 * TimeSlots - Available time slots for scheduling
 */
export function TimeSlots({ slots }: TimeSlotsProps) {
  if (slots.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>Available Slots</Text>
        <Text style={styles.emptyText}>No free slots available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Available Slots</Text>
      <View style={styles.slotsContainer}>
        {slots.map((slot, index) => (
          <TouchableOpacity key={index} style={styles.slotCard}>
            <Text style={styles.slotTime}>
              {formatTime(slot.start)} - {formatTime(slot.end)}
            </Text>
            <Text style={styles.slotDuration}>{slot.duration_minutes} min</Text>
          </TouchableOpacity>
        ))}
      </View>
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
    return isoString.split("T")[1]?.substring(0, 5) || isoString;
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
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 12,
  },
  slotsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotCard: {
    backgroundColor: "#252525",
    borderRadius: 8,
    padding: 12,
    minWidth: 100,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
  },
  slotTime: {
    fontSize: 14,
    color: "#4A90D9",
    fontWeight: "500",
  },
  slotDuration: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
  },
});
