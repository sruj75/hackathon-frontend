import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ConfirmationProps } from "@/types/generativeUI.types";

/**
 * Confirmation - Action confirmation modal
 */
export function Confirmation({ action, details }: ConfirmationProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.action}>{action}</Text>
      <Text style={styles.details}>{details}</Text>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmButton}>
          <Text style={styles.confirmText}>Confirm</Text>
        </TouchableOpacity>
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
    borderColor: "#4A90D9",
  },
  action: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  details: {
    fontSize: 14,
    color: "#ccc",
    marginBottom: 16,
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#333",
  },
  cancelText: {
    color: "#888",
    fontSize: 14,
  },
  confirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#4A90D9",
  },
  confirmText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
});
