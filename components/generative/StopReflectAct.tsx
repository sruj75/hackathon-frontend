import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StopReflectActProps } from '@/types/generativeUI.types';

/**
 * StopReflectAct - Emotional regulation wizard based on CBT principles
 *
 * Three phases:
 * - STOP: Emotional grounding, breathing prompts
 * - REFLECT: Cognitive reframing, challenge catastrophizing
 * - ACT: Action planning, commitment
 */
export function StopReflectAct({
  phase,
  title,
  prompt,
  action_items,
}: StopReflectActProps) {
  // Phase configuration
  const phaseConfig = {
    stop: {
      emoji: '🛑',
      color: '#E74C3C',
      label: 'STOP',
      bgColor: '#2C1810',
    },
    reflect: {
      emoji: '💭',
      color: '#F39C12',
      label: 'REFLECT',
      bgColor: '#2C2310',
    },
    act: {
      emoji: '🎯',
      color: '#27AE60',
      label: 'ACT',
      bgColor: '#102C18',
    },
  };

  const currentPhase = phaseConfig[phase];
  const phases = ['stop', 'reflect', 'act'] as const;
  const currentIndex = phases.indexOf(phase);

  return (
    <View style={styles.container}>
      {/* Progress Indicator */}
      <View style={styles.progressContainer}>
        {phases.map((p, index) => {
          const pConfig = phaseConfig[p];
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;

          return (
            <View key={p} style={styles.progressItem}>
              <View
                style={[
                  styles.progressDot,
                  {
                    backgroundColor:
                      isActive || isCompleted ? pConfig.color : '#444',
                    borderColor: pConfig.color,
                    borderWidth: isActive ? 2 : 0,
                  },
                ]}
              >
                {isCompleted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text
                style={[
                  styles.progressLabel,
                  {
                    color: isActive ? pConfig.color : '#888',
                    fontWeight: isActive ? '700' : '400',
                  },
                ]}
              >
                {pConfig.label}
              </Text>
              {index < phases.length - 1 && (
                <View
                  style={[
                    styles.progressLine,
                    {
                      backgroundColor: isCompleted ? pConfig.color : '#444',
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* Phase Content */}
      <ScrollView style={styles.content}>
        <View
          style={[styles.phaseCard, { backgroundColor: currentPhase.bgColor }]}
        >
          {/* Phase Header */}
          <View style={styles.phaseHeader}>
            <Text style={styles.phaseEmoji}>{currentPhase.emoji}</Text>
            <Text style={[styles.phaseTitle, { color: currentPhase.color }]}>
              {currentPhase.label}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.cardTitle}>{title}</Text>

          {/* Prompt */}
          <Text style={styles.prompt}>{prompt}</Text>

          {/* Action Items (ACT phase only) */}
          {phase === 'act' && action_items && action_items.length > 0 && (
            <View style={styles.actionItemsContainer}>
              <Text style={styles.actionItemsHeader}>Next Steps:</Text>
              {action_items.map((item, index) => (
                <View key={index} style={styles.actionItem}>
                  <Text style={styles.actionItemBullet}>•</Text>
                  <Text style={styles.actionItemText}>{item}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Phase-specific visual elements */}
          {phase === 'stop' && (
            <View style={styles.breathingContainer}>
              <View style={styles.breathingCircle}>
                <Text style={styles.breathingText}>Breathe</Text>
                <Text style={styles.breathingSubtext}>In... and out...</Text>
              </View>
            </View>
          )}

          {phase === 'reflect' && (
            <View style={styles.reframingBox}>
              <Text style={styles.reframingTitle}>Remember:</Text>
              <Text style={styles.reframingText}>
                Thoughts are not facts. You can challenge and reframe them.
              </Text>
            </View>
          )}

          {phase === 'act' && (
            <View style={styles.commitmentBox}>
              <Text style={styles.commitmentEmoji}>💪</Text>
              <Text style={styles.commitmentText}>
                Small steps lead to big changes
              </Text>
            </View>
          )}
        </View>

        {/* Helper text */}
        <Text style={styles.helperText}>
          {phase === 'stop' && 'Take a moment to pause and ground yourself'}
          {phase === 'reflect' && "Let's examine these thoughts together"}
          {phase === 'act' && 'Choose one small action to move forward'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  // Progress Indicator
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  progressDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  progressLine: {
    position: 'absolute',
    top: 16,
    left: '60%',
    right: '-60%',
    height: 2,
    zIndex: -1,
  },

  // Content
  content: {
    maxHeight: 400,
  },
  phaseCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  phaseEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  phaseTitle: {
    fontSize: 24,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  prompt: {
    fontSize: 16,
    color: '#ddd',
    lineHeight: 24,
    marginBottom: 20,
  },

  // Action Items
  actionItemsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  actionItemsHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#27AE60',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  actionItem: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  actionItemBullet: {
    color: '#27AE60',
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  actionItemText: {
    flex: 1,
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
  },

  // STOP Phase - Breathing
  breathingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  breathingCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    borderWidth: 2,
    borderColor: '#E74C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathingText: {
    color: '#E74C3C',
    fontSize: 18,
    fontWeight: '600',
  },
  breathingSubtext: {
    color: '#E74C3C',
    fontSize: 12,
    marginTop: 4,
  },

  // REFLECT Phase - Reframing
  reframingBox: {
    backgroundColor: 'rgba(243, 156, 18, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#F39C12',
    padding: 12,
    borderRadius: 6,
    marginTop: 16,
  },
  reframingTitle: {
    color: '#F39C12',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  reframingText: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // ACT Phase - Commitment
  commitmentBox: {
    backgroundColor: 'rgba(39, 174, 96, 0.15)',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  commitmentEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  commitmentText: {
    color: '#27AE60',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Helper text
  helperText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
