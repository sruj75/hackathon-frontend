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
  const [activeScenario, setActiveScenario] = useState<DemoScenario | null>(null);
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
      <Text style={styles.text}>Chat live with your voice AI agent</Text>

      <TouchableOpacity
        onPress={handleConnect}
        style={styles.button}
        activeOpacity={0.7}
        disabled={isSending}
      >
        {isSending ? (
          <ActivityIndicator
            size="small"
            color="#ffffff"
            style={styles.activityIndicator}
          />
        ) : undefined}

        <Text style={styles.buttonText}>{connectText}</Text>
      </TouchableOpacity>

      <Text style={styles.hintText}>
        Tap the button to receive a notification. Then tap the notification to
        start chatting!
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
    marginBottom: 24,
    fontSize: 16,
  },
  activityIndicator: {
    marginEnd: 8,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#002CF2',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  hintText: {
    color: '#666666',
    fontSize: 13,
    marginTop: 24,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
});
