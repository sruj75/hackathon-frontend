import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNotifications } from '@/hooks/useNotifications';

type DemoScenario = 'morning_braindump' | 'post_meeting_checkin';

export default function StartScreen() {
  const [isSending, setIsSending] = useState(false);
  const [activeScenario, setActiveScenario] = useState<DemoScenario | null>(
    null
  );
  // Initialize notifications (sets up permissions)
  useNotifications();

  const handleDemoNotification = async (scenario: DemoScenario) => {
    setIsSending(true);
    setActiveScenario(scenario);

    try {
      // Configure notification based on scenario
      const notificationConfig = {
        morning_braindump: {
          title: 'Good Morning! ☀️',
          body: "Let's plan your day together",
        },
        post_meeting_checkin: {
          title: 'Meeting Check-in 💭',
          body: 'How did your meeting go?',
        },
      };

      const config = notificationConfig[scenario];

      // Schedule notification with 5 second delay (gives time to lock device)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: config.title,
          body: config.body,
          data: { screen: 'assistant', scenario },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 3,
          repeats: false,
        },
      });

      setIsSending(false);
      setActiveScenario(null);

      // Show feedback to user
      Alert.alert(
        'Notification Sent!',
        'Check your lock screen and tap the notification to open the agent',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
      setIsSending(false);
      setActiveScenario(null);
      Alert.alert('Error', 'Failed to send notification. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Pick a demo and lock your screen</Text>
      <Text style={styles.noteText}>
        You'll receive a notification to experiance a mock proactive check in.
        In production, notifications are triggered autonomously by the agent.
      </Text>
      <Text style={styles.subNoteText}>
        Backend may take a moment to initialize on first request.
      </Text>
      <TouchableOpacity
        onPress={() => handleDemoNotification('morning_braindump')}
        style={[styles.button, styles.buttonMorning]}
        activeOpacity={0.7}
        disabled={isSending}
      >
        {isSending && activeScenario === 'morning_braindump' ? (
          <ActivityIndicator
            size="small"
            color="#ffffff"
            style={styles.activityIndicator}
          />
        ) : (
          <Text style={styles.buttonEmoji}>☀️</Text>
        )}

        <Text style={styles.buttonText}>
          {isSending && activeScenario === 'morning_braindump'
            ? 'Sending...'
            : 'Demo 1: Morning Chaos'}
        </Text>
      </TouchableOpacity>

      {/* Demo 2: Post-Meeting Check-in */}
      <TouchableOpacity
        onPress={() => handleDemoNotification('post_meeting_checkin')}
        style={[styles.button, styles.buttonCheckin]}
        activeOpacity={0.7}
        disabled={isSending}
      >
        {isSending && activeScenario === 'post_meeting_checkin' ? (
          <ActivityIndicator
            size="small"
            color="#ffffff"
            style={styles.activityIndicator}
          />
        ) : (
          <Text style={styles.buttonEmoji}>💭</Text>
        )}

        <Text style={styles.buttonText}>
          {isSending && activeScenario === 'post_meeting_checkin'
            ? 'Sending...'
            : 'Demo 2: Emotional Support'}
        </Text>
      </TouchableOpacity>

      {/* Demo 1: Morning Brain Dump */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logo: {
    width: 59,
    height: 56,
    marginBottom: 16,
  },
  text: {
    color: '#ffffff',
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.9,
  },
  noteText: {
    color: '#ffffff',
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
    opacity: 0.6,
    lineHeight: 18,
  },
  subNoteText: {
    color: '#ffffff',
    marginBottom: 20,
    fontSize: 11,
    fontWeight: '300',
    textAlign: 'center',
    opacity: 0.4,
  },
  demoNote: {
    backgroundColor: '#1a2332',
    borderLeftWidth: 3,
    borderLeftColor: '#4A90D9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    marginHorizontal: 16,
    maxWidth: 340,
  },
  demoNoteText: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'left',
  },
  activityIndicator: {
    marginEnd: 8,
  },
  button: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 280,
    marginTop: 12,
  },
  buttonMorning: {
    backgroundColor: '#4A90D9',
  },
  buttonCheckin: {
    backgroundColor: '#9B59B6',
  },
  buttonEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  demoDescription: {
    color: '#888888',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
    maxWidth: 280,
  },
  hintText: {
    color: '#666666',
    fontSize: 13,
    marginTop: 32,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
});
