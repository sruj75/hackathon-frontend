import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface ActPhaseVisualProps {
  color?: string;
}

/**
 * ACT Phase Visual - Momentum & Progress
 *
 * Auto-rendered elements:
 * 1. Progressive step circles - 3 steps with first one emphasized
 * 2. Animated progress line - connecting the steps
 * 3. Pulsing focus indicator - on current step
 * 4. Forward arrow - showing momentum direction
 * 5. Mini celebration - subtle confetti or stars
 */
export function ActPhaseVisual({ color = '#27AE60' }: ActPhaseVisualProps) {
  const pulse = useRef(new Animated.Value(1)).current;
  const progressLine = useRef(new Animated.Value(0)).current;
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse the current step continuously
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    // Animate progress line
    Animated.timing(progressLine, {
      toValue: 1,
      duration: 1500,
      delay: 300,
      useNativeDriver: false,
    }).start(() => {
      setShowCelebration(true);
      // Fade in celebration
      Animated.timing(celebrationOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      pulseAnimation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressWidth = progressLine.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.actContainer}>
      {/* Steps container */}
      <View style={styles.stepsRow}>
        {[1, 2, 3].map((step, i) => (
          <View key={step} style={styles.stepItem}>
            {/* Step circle */}
            <Animated.View
              style={[
                styles.stepCircle,
                i === 0 && {
                  backgroundColor: color,
                  transform: [{ scale: pulse }],
                },
                i > 0 && styles.futureStep,
              ]}
            >
              <Text
                style={[styles.stepNumber, i === 0 && styles.activeStepNumber]}
              >
                {step}
              </Text>

              {/* Focus ring on active step */}
              {i === 0 && (
                <View style={[styles.focusRing, { borderColor: color }]} />
              )}
            </Animated.View>

            {/* Step label */}
            <Text
              style={[
                styles.stepLabel,
                i === 0 && { color, fontWeight: '700' },
              ]}
            >
              {i === 0 ? 'Start here' : `Step ${step}`}
            </Text>

            {/* Connector line */}
            {i < 2 && (
              <View style={styles.connectorWrapper}>
                <View style={styles.connectorBase} />
                <Animated.View
                  style={[
                    styles.connectorProgress,
                    {
                      width: progressWidth,
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Forward momentum arrow */}
      <View style={styles.momentumArrow}>
        <Text style={[styles.arrowIcon, { color }]}>→</Text>
        <Text style={[styles.momentumText, { color }]}>Forward</Text>
      </View>

      {/* Mini celebration */}
      {showCelebration && (
        <Animated.View
          style={[styles.celebration, { opacity: celebrationOpacity }]}
        >
          <Text style={styles.star}>✨</Text>
          <Text style={styles.star}>⭐</Text>
          <Text style={styles.star}>✨</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actContainer: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 20,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  stepCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: '#444',
    marginBottom: 8,
    position: 'relative',
  },
  futureStep: {
    opacity: 0.5,
  },
  stepNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#666',
  },
  activeStepNumber: {
    color: '#fff',
  },
  focusRing: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
  },
  stepLabel: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    fontWeight: '600',
  },
  connectorWrapper: {
    position: 'absolute',
    top: 28,
    left: '70%',
    right: '-70%',
    height: 2,
  },
  connectorBase: {
    position: 'absolute',
    width: '100%',
    height: 2,
    backgroundColor: '#444',
  },
  connectorProgress: {
    position: 'absolute',
    height: 2,
  },
  momentumArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  arrowIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  momentumText: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  celebration: {
    position: 'absolute',
    top: 20,
    right: 20,
    flexDirection: 'row',
    gap: 8,
  },
  star: {
    fontSize: 20,
  },
});
