import React, { useCallback, useState, useEffect } from 'react';
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  Animated,
} from 'react-native';

type AgentVisualizationProps = {
  style: StyleProp<ViewStyle>;
  isConnected?: boolean;
  isPlaying?: boolean;
};

const BAR_COUNT = 5;

export default function AgentVisualization({
  style,
  isConnected = false,
  isPlaying = false
}: AgentVisualizationProps) {
  const [barHeights] = useState(() =>
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  );
  const [barWidth, setBarWidth] = useState(20);
  const [containerHeight, setContainerHeight] = useState(100);

  // Animate bars when playing audio
  useEffect(() => {
    if (isPlaying) {
      const animateBars = () => {
        const animations = barHeights.map((height, index) => {
          return Animated.sequence([
            Animated.timing(height, {
              toValue: 0.3 + Math.random() * 0.7,
              duration: 150 + Math.random() * 100,
              useNativeDriver: false,
            }),
            Animated.timing(height, {
              toValue: 0.3,
              duration: 150 + Math.random() * 100,
              useNativeDriver: false,
            }),
          ]);
        });

        Animated.parallel(animations).start((finished) => {
          if (finished && isPlaying) {
            animateBars();
          }
        });
      };

      animateBars();
    } else {
      // Reset to idle state
      barHeights.forEach(height => {
        Animated.timing(height, {
          toValue: 0.3,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isPlaying, barHeights]);

  const layoutCallback = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setContainerHeight(height);
    setBarWidth(Math.min(width / BAR_COUNT * 0.6, height * 0.2));
  }, []);

  return (
    <View style={[style, styles.container]}>
      <View style={styles.barVisualizerContainer} onLayout={layoutCallback}>
        <View style={styles.barsRow}>
          {barHeights.map((height, index) => (
            <Animated.View
              key={index}
              style={[
                styles.bar,
                {
                  width: barWidth,
                  borderRadius: barWidth / 2,
                  height: height.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: isConnected ? '#FFFFFF' : '#666666',
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  barVisualizerContainer: {
    width: '100%',
    height: '30%',
  },
  barsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bar: {
    backgroundColor: '#FFFFFF',
  },
});
