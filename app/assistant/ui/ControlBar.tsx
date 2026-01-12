import React, { useState, useEffect } from 'react';
import {
  ViewStyle,
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  StyleProp,
  Animated,
} from 'react-native';

type ControlBarProps = {
  style?: StyleProp<ViewStyle>;
  options: ControlBarOptions;
};

type ControlBarOptions = {
  isMicEnabled: boolean;
  onMicClick: () => void;
  isCameraEnabled: boolean;
  onCameraClick: () => void;
  isChatEnabled: boolean;
  onChatClick: () => void;
  onExitClick: () => void;
};

// Simple animated mic visualizer
const MicVisualizer = ({ isActive }: { isActive: boolean }) => {
  const [bars] = useState(() =>
    Array.from({ length: 3 }, () => new Animated.Value(0.3))
  );

  useEffect(() => {
    if (isActive) {
      const animateBars = () => {
        const animations = bars.map((bar) =>
          Animated.sequence([
            Animated.timing(bar, {
              toValue: 0.3 + Math.random() * 0.7,
              duration: 100 + Math.random() * 100,
              useNativeDriver: false,
            }),
            Animated.timing(bar, {
              toValue: 0.3,
              duration: 100 + Math.random() * 100,
              useNativeDriver: false,
            }),
          ])
        );
        Animated.parallel(animations).start(({ finished }) => {
          if (finished && isActive) animateBars();
        });
      };
      animateBars();
    } else {
      bars.forEach(bar => {
        Animated.timing(bar, {
          toValue: 0.3,
          duration: 150,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [isActive, bars]);

  return (
    <View style={styles.micVisualizer}>
      {bars.map((height, index) => (
        <Animated.View
          key={index}
          style={[
            styles.micBar,
            {
              height: height.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: isActive ? '#00FF00' : '#CCCCCC',
            },
          ]}
        />
      ))}
    </View>
  );
};

export default function ControlBar({ style = {}, options }: ControlBarProps) {
  // Images
  const micImage = options.isMicEnabled
    ? require('@/assets/images/mic_24dp.png')
    : require('@/assets/images/mic_off_24dp.png');
  const cameraImage = options.isCameraEnabled
    ? require('@/assets/images/videocam_24dp.png')
    : require('@/assets/images/videocam_off_24dp.png');
  const chatImage = options.isChatEnabled
    ? require('@/assets/images/chat_24dp.png')
    : require('@/assets/images/chat_off_24dp.png');
  const exitImage = require('@/assets/images/call_end_24dp.png');

  return (
    <View style={[style, styles.container]}>
      <TouchableOpacity
        style={[
          styles.button,
          options.isMicEnabled ? styles.enabledButton : undefined,
        ]}
        activeOpacity={0.7}
        onPress={() => options.onMicClick()}
      >
        <Image style={styles.icon} source={micImage} />
        <MicVisualizer isActive={options.isMicEnabled} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          options.isCameraEnabled ? styles.enabledButton : undefined,
        ]}
        activeOpacity={0.7}
        onPress={() => options.onCameraClick()}
      >
        <Image style={styles.icon} source={cameraImage} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.button,
          options.isChatEnabled ? styles.enabledButton : undefined,
        ]}
        activeOpacity={0.7}
        onPress={() => options.onChatClick()}
      >
        <Image style={styles.icon} source={chatImage} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.7}
        onPress={() => options.onExitClick()}
      >
        <Image style={styles.icon} source={exitImage} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 8,
    backgroundColor: '#070707',
    borderColor: '#202020',
    borderRadius: 53,
    borderWidth: 1,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    padding: 10,
    marginHorizontal: 4,
    marginVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enabledButton: {
    backgroundColor: '#131313',
  },
  icon: {
    width: 20,
  },
  micVisualizer: {
    width: 20,
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  micBar: {
    width: 3,
    borderRadius: 2,
  },
});
