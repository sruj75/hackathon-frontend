import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';

export default function StartScreen() {
  const router = useRouter();
  const [isConnecting, setConnecting] = useState(false);

  const handleConnect = () => {
    setConnecting(true);

    // Check if backend URL is configured
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      console.error('EXPO_PUBLIC_BACKEND_URL not configured');
      setConnecting(false);
      return;
    }

    // Navigate to assistant screen - connection happens there
    setTimeout(() => {
      setConnecting(false);
      router.navigate('../assistant');
    }, 500);
  };

  const connectText = isConnecting ? 'Connecting' : 'Start Voice Assistant';

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
        disabled={isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator
            size="small"
            color="#ffffff"
            style={styles.activityIndicator}
          />
        ) : undefined}

        <Text style={styles.buttonText}>{connectText}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 59,
    height: 56,
    marginBottom: 16,
  },
  text: {
    color: '#ffffff',
    marginBottom: 24,
  },
  activityIndicator: {
    marginEnd: 8,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#002CF2',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  buttonText: {
    color: '#ffffff',
  },
});
