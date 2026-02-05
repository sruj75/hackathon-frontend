import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { CalendarEvent } from '@/types/generativeUI.types';

interface CalendarViewProps {
  events: CalendarEvent[];
}

/**
 * CalendarView - Dedicated view for calendar events
 */
export function CalendarView({ events }: CalendarViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Calendar</Text>

      <ScrollView style={styles.timeline}>
        {events.length > 0 ? (
          <View style={styles.section}>
            {events.map((event) => (
              <View key={event.id} style={styles.eventCard}>
                <Text style={styles.eventTime}>
                  {formatTime(event.start_time)} - {formatTime(event.end_time)}
                </Text>
                <Text style={styles.eventTitle}>{event.title}</Text>
                {event.description && (
                  <Text style={styles.eventDescription} numberOfLines={2}>
                    {event.description}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No events scheduled</Text>
        )}
      </ScrollView>
    </View>
  );
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
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
  timeline: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  eventCard: {
    backgroundColor: '#1e2838',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90D9',
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  eventTime: {
    fontSize: 12,
    color: '#60A5FA',
    marginBottom: 6,
    fontWeight: '600',
  },
  eventTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    lineHeight: 22,
  },
  eventDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontStyle: 'italic',
  },
});
