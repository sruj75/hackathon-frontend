import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SchedulePickerProps } from "@/types/generativeUI.types";

/**
 * SchedulePicker - "When do you want to do this?" picker
 */
export function SchedulePicker({ task, slots }: SchedulePickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Schedule Task</Text>
      <View style={styles.taskPreview}>
        <Text style={styles.taskTitle}>{task.title}</Text>
      </View>

      <Text style={styles.subheader}>Pick a time:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.slotsScroll}
      >
        <View style={styles.slotsContainer}>
          {slots.map((slot, index) => (
            <TouchableOpacity key={index} style={styles.slotButton}>
              <Text style={styles.slotTime}>{formatTime(slot.start)}</Text>
              <Text style={styles.slotDuration}>{slot.duration_minutes}m</Text>
            </TouchableOpacity>
          ))}
        </View>
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
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  taskPreview: {
    backgroundColor: "#252525",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  taskTitle: {
    fontSize: 15,
    color: "#fff",
  },
  subheader: {
    fontSize: 14,
    color: "#888",
    marginBottom: 8,
  },
  slotsScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  slotsContainer: {
    flexDirection: "row",
    gap: 8,
  },
  slotButton: {
    backgroundColor: "#4A90D9",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  slotTime: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
  slotDuration: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
  },
});
