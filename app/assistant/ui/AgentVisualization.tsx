import {
  useParticipantTracks,
  useRemoteParticipants,
} from '@livekit/react-native';
import { BarVisualizer, VideoTrack } from '@livekit/react-native';
import { ParticipantKind, Track } from 'livekit-client';
import React, { useCallback, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

type AgentVisualizationProps = {
  style: StyleProp<ViewStyle>;
};

const barSize = 0.2;

export default function AgentVisualization({ style }: AgentVisualizationProps) {
  const participants = useRemoteParticipants();
  const agent = participants.find((p) => p.kind === ParticipantKind.AGENT);
  const agentIdentity = agent?.identity;

  const agentAudioTracks = useParticipantTracks(
    [Track.Source.Microphone],
    agentIdentity
  );
  const agentVideoTracks = useParticipantTracks(
    [Track.Source.Camera],
    agentIdentity
  );
  const audioTrack =
    agentAudioTracks.length > 0 ? agentAudioTracks[0] : undefined;
  const videoTrack =
    agentVideoTracks.length > 0 ? agentVideoTracks[0] : undefined;
  const [barWidth, setBarWidth] = useState(0);
  const [barBorderRadius, setBarBorderRadius] = useState(0);
  const layoutCallback = useCallback((event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    console.log(x, y, width, height);
    setBarWidth(barSize * height);
    setBarBorderRadius(barSize * height);
  }, []);
  let videoView = videoTrack ? (
    <VideoTrack trackRef={videoTrack} style={styles.videoTrack} />
  ) : null;
  return (
    <View style={[style, styles.container]}>
      <View style={styles.barVisualizerContainer} onLayout={layoutCallback}>
        <BarVisualizer
          barCount={5}
          options={{
            minHeight: barSize,
            barWidth: barWidth,
            barColor: '#FFFFFF',
            barBorderRadius: barBorderRadius,
          }}
          trackRef={audioTrack}
          style={styles.barVisualizer}
        />
      </View>
      {videoView}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTrack: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  barVisualizerContainer: {
    width: '100%',
    height: '30%',
    zIndex: 0,
  },
  barVisualizer: {
    width: '100%',
    height: '100%',
  },
});
