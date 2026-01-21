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
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    flex: 1,
  },
  header: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  timeline: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  eventCard: {
    backgroundColor: '#252525',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4A90D9',
  },
  eventTime: {
    fontSize: 12,
    color: '#4A90D9',
    marginBottom: 4,
  },
  eventTitle: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  eventDescription: {
    fontSize: 13,
    color: '#aaa',
    marginTop: 4,
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
});
