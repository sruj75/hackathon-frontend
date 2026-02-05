import { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
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

      // Send local notification immediately
      await Notifications.scheduleNotificationAsync({
        content: {
          title: config.title,
          body: config.body,
          data: { screen: 'assistant', scenario },
          sound: true,
        },
        trigger: null, // null = immediate delivery
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
      <Image
        style={styles.logo}
        source={require('../../assets/images/start-logo.png')}
      />
      <Text style={styles.text}>Choose your demo scenario</Text>

      {/* Demo Note */}
      <View style={styles.demoNote}>
        <Text style={styles.demoNoteText}>
          These scenarios use mock data and on-demand notifications for
          presentation purposes. In production, the agent proactively triggers
          notifications based on your calendar and daily context.
        </Text>
      </View>

      {/* Demo 1: Morning Brain Dump */}
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
            : 'Demo 1: Morning Brain Dump'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.demoDescription}>
        Plan your day with AI-powered task organization
      </Text>

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

      <Text style={styles.demoDescription}>
        STOP-REFLECT-ACT model for emotional regulation
      </Text>

      <Text style={styles.hintText}>
        Tap a button to receive a notification. Then tap the notification to
        start the demo!
      </Text>
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
    marginBottom: 16,
    fontSize: 18,
    fontWeight: '600',
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
