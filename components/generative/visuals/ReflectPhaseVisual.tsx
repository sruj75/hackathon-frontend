import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface ReflectPhaseVisualProps {
  color?: string;
}

/**
 * REFLECT Phase Visual - Cognitive Reframing
 *
 * Auto-rendered elements:
 * 1. Thought bubbles transformation - old thought → new thought with animation
 * 2. Connection lines - showing cognitive path from distorted to realistic
 * 3. Checkmark/X icons - visual validation
 * 4. Glow effect - highlighting the reframed thought
 */
export function ReflectPhaseVisual({
  color = '#F39C12',
}: ReflectPhaseVisualProps) {
  const fadeOut = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const arrowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Stagger the transformation animation
    const transformationSequence = Animated.sequence([
      Animated.delay(500),
      // Fade out old thought and fade in arrow
      Animated.parallel([
        Animated.timing(fadeOut, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(arrowOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(300),
      // Fade in new thought
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      // Start glow loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glow, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ),
    ]);

    transformationSequence.start();

    return () => {
      transformationSequence.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.reflectContainer}>
      {/* Background glow effect */}
      <Animated.View
        style={[
          styles.glowCircle,
          {
            backgroundColor: `${color}20`,
            opacity: glow,
          },
        ]}
      />

      <View style={styles.thoughtsRow}>
        {/* Old distorted thought - fades out */}
        <Animated.View style={[styles.thoughtBubble, { opacity: fadeOut }]}>
          <View style={[styles.thoughtContent, styles.oldThoughtContent]}>
            <Text style={styles.xIcon}>❌</Text>
            <Text style={styles.oldThought}>Catastrophic</Text>
          </View>
          <Text style={styles.label}>Distortion</Text>
        </Animated.View>

        {/* Animated transformation arrow */}
        <Animated.View
          style={[styles.arrowContainer, { opacity: arrowOpacity }]}
        >
          <View style={styles.dashedLine} />
          <Text style={styles.arrow}>→</Text>
          <View style={styles.dashedLine} />
        </Animated.View>

        {/* New realistic thought - fades in with glow */}
        <Animated.View style={[styles.thoughtBubble, { opacity: fadeIn }]}>
          <Animated.View
            style={[
              styles.thoughtContent,
              styles.newThoughtContent,
              {
                borderColor: color,
                shadowColor: color,
                shadowOpacity: glow.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.5],
                }),
              },
            ]}
          >
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={[styles.newThought, { color }]}>Evidence-based</Text>
          </Animated.View>
          <Text style={[styles.label, { color }]}>Reality</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reflectContainer: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 20,
  },
  glowCircle: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  thoughtsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  thoughtBubble: {
    alignItems: 'center',
    flex: 1,
  },
  thoughtContent: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    marginBottom: 8,
  },
  oldThoughtContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: '#666',
  },
  newThoughtContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  xIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  checkIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  oldThought: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontWeight: '500',
  },
  newThought: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '700',
  },
  label: {
    fontSize: 10,
    color: '#666',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  arrowContainer: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  dashedLine: {
    width: 20,
    height: 1,
    backgroundColor: '#666',
    marginVertical: 2,
  },
  arrow: {
    fontSize: 24,
    color: '#F39C12',
    marginVertical: 4,
  },
});
