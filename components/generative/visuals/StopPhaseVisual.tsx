import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface StopPhaseVisualProps {
  color?: string;
}

/**
 * STOP Phase Visual - Grounding & Calming
 *
 * Auto-rendered elements:
 * 1. Animated breathing circle - pulsing with 4-7-8 pattern
 * 2. Ripple rings - concentric circles expanding outward
 * 3. Breathing text overlay - "Inhale... Hold... Exhale..." synced to animation
 * 4. Calming gradient background - subtle animated gradient
 */
export function StopPhaseVisual({ color = '#E74C3C' }: StopPhaseVisualProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const [breathingText, setBreathingText] = useState('Inhale...');

  useEffect(() => {
    // Main breathing animation - 4-7-8 pattern
    const breathingSequence = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.3,
        duration: 4000,
        useNativeDriver: true,
      }), // Inhale 4s
      Animated.delay(7000), // Hold 7s
      Animated.timing(scale, {
        toValue: 1.0,
        duration: 8000,
        useNativeDriver: true,
      }), // Exhale 8s
    ]);

    // Ripple effects - continuous expanding circles
    const rippleSequence = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ripple1, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(ripple1, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(1500),
          Animated.timing(ripple2, {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
          }),
          Animated.timing(ripple2, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    const breathingLoop = Animated.loop(breathingSequence);
    breathingLoop.start();
    rippleSequence.start();

    // Sync text with breathing pattern
    let currentPhase = 0;
    const textInterval = setInterval(() => {
      if (currentPhase === 0) {
        setBreathingText('Inhale...');
        currentPhase = 1;
        setTimeout(() => {
          setBreathingText('Hold...');
          currentPhase = 2;
        }, 4000);
        setTimeout(() => {
          setBreathingText('Exhale...');
          currentPhase = 0;
        }, 11000);
      }
    }, 19000); // Full cycle: 4s + 7s + 8s = 19s

    // Initial text sequence
    setTimeout(() => {
      setBreathingText('Hold...');
    }, 4000);
    setTimeout(() => {
      setBreathingText('Exhale...');
    }, 11000);

    return () => {
      breathingLoop.stop();
      rippleSequence.stop();
      clearInterval(textInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Interpolate ripple scale
  const ripple1Scale = ripple1.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2],
  });

  const ripple2Scale = ripple2.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2],
  });

  return (
    <View style={styles.stopContainer}>
      {/* Gradient background */}
      <View style={[styles.gradient, { backgroundColor: `${color}15` }]} />

      {/* Ripple rings */}
      <Animated.View
        style={[
          styles.ripple,
          {
            borderColor: color,
            opacity: ripple1.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.6, 0.3, 0],
            }),
            transform: [{ scale: ripple1Scale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ripple,
          {
            borderColor: color,
            opacity: ripple2.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [0.6, 0.3, 0],
            }),
            transform: [{ scale: ripple2Scale }],
          },
        ]}
      />

      {/* Main breathing circle with text */}
      <Animated.View
        style={[styles.breathingCircleContainer, { transform: [{ scale }] }]}
      >
        <View style={[styles.breathingCircle, { borderColor: color }]}>
          <Text style={[styles.breathingText, { color }]}>{breathingText}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stopContainer: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
  },
  ripple: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  breathingCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathingCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  breathingText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
