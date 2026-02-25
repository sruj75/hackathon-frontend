import { StyleSheet, Text, View } from 'react-native';

export default function OnboardingPlaceholderScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Onboarding Agent Coming Next</Text>
      <Text style={styles.body}>
        Your account is connected. We are preparing your guided onboarding
        conversation.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#05070D',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    color: '#B8C0D6',
    textAlign: 'center',
  },
});
