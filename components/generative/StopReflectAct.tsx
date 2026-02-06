import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StopReflectActProps } from '@/types/generativeUI.types';
import { StopPhaseVisual } from './visuals/StopPhaseVisual';
import { ReflectPhaseVisual } from './visuals/ReflectPhaseVisual';
import { ActPhaseVisual } from './visuals/ActPhaseVisual';

/**
 * StopReflectAct - Emotional regulation wizard based on CBT principles
 *
 * Visual-first design with automatic phase-based visuals:
 * - STOP: Animated breathing circle with ripples and text sync
 * - REFLECT: Thought transformation with glow effects
 * - ACT: Progressive steps with momentum indicators
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

  // Auto-select rich visual based on phase - NO AGENT DECISION NEEDED
  const renderPhaseVisual = () => {
    switch (phase) {
      case 'stop':
        return <StopPhaseVisual color={currentPhase.color} />;
      case 'reflect':
        return <ReflectPhaseVisual color={currentPhase.color} />;
      case 'act':
        return <ActPhaseVisual color={currentPhase.color} />;
    }
  };

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

      {/* Phase Content - Visual-dominant layout */}
      <ScrollView style={styles.content}>
        {/* Small title */}
        <Text style={styles.smallTitle}>{title}</Text>

        {/* MASSIVE VISUAL AREA - takes center stage */}
        <View style={styles.visualContainer}>{renderPhaseVisual()}</View>

        {/* STOP: Breathing Guide */}
        {phase === 'stop' && (
          <View style={styles.breathingGuide}>
            <Text style={styles.breathingText}>Breathe slowly and deeply</Text>
            <Text style={styles.breathingPattern}>
              In (4s) → Hold (4s) → Out (6s)
            </Text>
          </View>
        )}

        {/* REFLECT: Reframing Questions */}
        {phase === 'reflect' && (
          <View style={styles.reframingQuestions}>
            <Text style={styles.questionPrompt}>Consider:</Text>
            <View style={styles.question}>
              <Text style={styles.questionBullet}>•</Text>
              <Text style={styles.questionText}>
                What evidence supports this thought?
              </Text>
            </View>
            <View style={styles.question}>
              <Text style={styles.questionBullet}>•</Text>
              <Text style={styles.questionText}>
                What would you tell a friend in this situation?
              </Text>
            </View>
            <View style={styles.question}>
              <Text style={styles.questionBullet}>•</Text>
              <Text style={styles.questionText}>
                What's another way to look at this?
              </Text>
            </View>
          </View>
        )}

        {/* ACT: Next Steps */}
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

  // Content - Visual-dominant layout
  content: {
    maxHeight: 450,
  },
  smallTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  visualContainer: {
    marginVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Breathing Guide (STOP phase)
  breathingGuide: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 16,
  },
  breathingText: {
    fontSize: 15,
    color: '#ddd',
    marginBottom: 8,
    textAlign: 'center',
  },
  breathingPattern: {
    fontSize: 13,
    color: '#E74C3C',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 1,
  },

  // Reframing Questions (REFLECT phase)
  reframingQuestions: {
    marginTop: 20,
    paddingHorizontal: 8,
  },
  questionPrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F39C12',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  question: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  questionBullet: {
    color: '#F39C12',
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  questionText: {
    flex: 1,
    color: '#ddd',
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  // Action Items - Simplified (ACT phase)
  actionItemsContainer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  actionItemsHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#27AE60',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    fontSize: 14,
    lineHeight: 20,
  },
});
