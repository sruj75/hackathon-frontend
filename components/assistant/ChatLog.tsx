import { useCallback } from 'react';
import {
    ListRenderItemInfo,
    StyleProp,
    StyleSheet,
    Text,
    useColorScheme,
    View,
    ViewStyle,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

// Simple transcription type for WebSocket mode
export interface Transcription {
    participant: string;
    text: string;
    timestamp: number;
}

export type ChatLogProps = {
    style: StyleProp<ViewStyle>;
    transcriptions: Transcription[];
};

export default function ChatLog({ style, transcriptions }: ChatLogProps) {
    const renderItem = useCallback(
        ({ item }: ListRenderItemInfo<Transcription>) => {
            // Check if it's the agent or user
            const isAgent = item.participant.toLowerCase().includes('agent') ||
                item.participant === 'Agent';

            if (isAgent) {
                return <AgentTranscriptionText text={item.text} />;
            } else {
                return <UserTranscriptionText text={item.text} />;
            }
        },
        []
    );

    // Reverse the list so newest items appear at bottom (with inverted list, they show on top)
    const reversedTranscriptions = [...transcriptions].reverse();

    return (
        <Animated.FlatList
            renderItem={renderItem}
            data={reversedTranscriptions}
            style={style}
            inverted={true}
            itemLayoutAnimation={LinearTransition}
            keyExtractor={(item, index) => `${item.timestamp}-${index}`}
        />
    );
}

const UserTranscriptionText = (props: { text: string }) => {
    const { text } = props;
    const colorScheme = useColorScheme();
    const themeStyle =
        colorScheme === 'light'
            ? styles.userTranscriptionLight
            : styles.userTranscriptionDark;
    const themeTextStyle =
        colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;

    return (
        text ? (
            <View style={styles.userTranscriptionContainer}>
                <Text style={[styles.userTranscription, themeStyle, themeTextStyle]}>
                    {text}
                </Text>
            </View>
        ) : null
    );
};

const AgentTranscriptionText = (props: { text: string }) => {
    const { text } = props;
    const colorScheme = useColorScheme();
    const themeTextStyle =
        colorScheme === 'light' ? styles.lightThemeText : styles.darkThemeText;

    return (
        text ? (
            <Text style={[styles.agentTranscription, themeTextStyle]}>{text}</Text>
        ) : null
    );
};

const styles = StyleSheet.create({
    userTranscriptionContainer: {
        width: '100%',
        alignContent: 'flex-end',
    },
    userTranscription: {
        width: 'auto',
        fontSize: 17,
        alignSelf: 'flex-end',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        margin: 16,
    },
    userTranscriptionLight: {
        backgroundColor: '#B0B0B0',
    },
    userTranscriptionDark: {
        backgroundColor: '#131313',
    },
    agentTranscription: {
        fontSize: 17,
        textAlign: 'left',
        margin: 16,
    },
    lightThemeText: {
        color: '#000000',
    },
    darkThemeText: {
        color: '#FFFFFF',
    },
});
