import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CoachLive from './src/services/CoachLive';

export default function App() {
  return (
    <SafeAreaProvider>
      <CoachLive />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
