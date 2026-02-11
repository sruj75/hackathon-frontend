import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * WebSocket connection hook for ADK bidi-streaming.
 * Replaces the LiveKit-based useConnectionDetails hook.
 */

export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export interface ADKEvent {
  // ADK event structure
  content?: {
    parts?: {
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
      functionCall?: {
        name: string;
        args: Record<string, unknown>;
      };
    }[];
  };
  partial?: boolean;
  turnComplete?: boolean;
  interrupted?: boolean;
  // Transcription events
  serverContent?: {
    inputTranscription?: { text: string };
    outputTranscription?: { text: string };
  };
}

export interface ConnectOptions {
  resume_session_id?: string;
  trigger_type?: string;
  timezone?: string;
}

export interface UseWebSocketAgentReturn {
  state: WebSocketState;
  connect: (options?: ConnectOptions) => void;
  disconnect: () => void;
  sendAudio: (audioData: ArrayBuffer) => void;
  sendText: (text: string) => void;
  onEvent: (callback: (event: ADKEvent) => void) => void;
  onAudio: (
    callback: (audioData: ArrayBuffer | string, mimeType?: string) => void
  ) => void;
  onUIComponent: (callback: (component: GenerativeUIEvent) => void) => void;
}

// Generative UI event type
export interface GenerativeUIEvent {
  id: string;
  type: string;
  props: Record<string, unknown>;
  timestamp: number;
}

export function useWebSocketAgent(
  sessionId: string,
  accessToken: string | null
): UseWebSocketAgentReturn {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef<number>(0);
  const MAX_RETRIES = 3;
  const connectOptionsRef = useRef<ConnectOptions | undefined>(undefined);

  const eventCallbackRef = useRef<((event: ADKEvent) => void) | null>(null);
  const audioCallbackRef = useRef<
    ((audioData: ArrayBuffer | string, mimeType?: string) => void) | null
  >(null);
  const uiComponentCallbackRef = useRef<
    ((component: GenerativeUIEvent) => void) | null
  >(null);

  const getWebSocketUrl = useCallback(() => {
    // NOTE: If production requires a separate WebSocket URL (different port/host),
    // add EXPO_PUBLIC_WS_URL env var and use it here as override.
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    console.log('DEBUG: EXPO_PUBLIC_BACKEND_URL =', baseUrl);
    if (!baseUrl) {
      throw new Error('EXPO_PUBLIC_BACKEND_URL not configured');
    }

    // Validate URL format for clear error messages
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      throw new Error(
        `EXPO_PUBLIC_BACKEND_URL must start with http:// or https://. Got: "${baseUrl}"`
      );
    }

    // Convert http(s) to ws(s) - assumes WS runs on same host:port as HTTP
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/ws/${sessionId}`;
  }, [sessionId]);

  const connect = useCallback(
    (options?: ConnectOptions) => {
      if (
        wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING
      ) {
        console.log('WebSocket already connected/connecting');
        return;
      }

      // Store options for retry attempts
      connectOptionsRef.current = options;

      if (!accessToken) {
        setState({
          isConnected: false,
          isConnecting: false,
          error: 'Missing access token',
        });
        return;
      }

      setState({ isConnected: false, isConnecting: true, error: null });

      try {
        const url = getWebSocketUrl();
        console.log('Connecting to WebSocket:', url);
        const ws = new WebSocket(url);

        ws.onopen = () => {
          console.log('WebSocket connected');
          let timezone = options?.timezone;
          if (!options?.timezone) {
            try {
              timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            } catch (error) {
              console.warn('[WS-INIT] Failed to detect device timezone', error);
            }
          }

          const initMessage = {
            type: 'init',
            access_token: accessToken,
            resume_session_id: options?.resume_session_id,
            trigger_type: options?.trigger_type,
            timezone,
          };
          console.log('[WS-INIT] Sending init handshake:', initMessage);
          ws.send(JSON.stringify(initMessage));

          setState({ isConnected: true, isConnecting: false, error: null });
          retryCountRef.current = 0; // Reset retries on success
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          // Only reset state if we are not retrying
          if (retryCountRef.current === 0) {
            setState({ isConnected: false, isConnecting: false, error: null });
          }
          wsRef.current = null;
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);

          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            console.log(
              `WebSocket connection failed. Retrying (${
                retryCountRef.current
              }/${MAX_RETRIES}) in ${retryCountRef.current * 2}s...`
            );

            setTimeout(() => {
              connect(connectOptionsRef.current);
            }, 2000 * retryCountRef.current);
          } else {
            setState({
              isConnected: false,
              isConnecting: false,
              error: 'Connection failed after 3 attempts',
            });
            retryCountRef.current = 0;
          }
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            // JSON event from server
            try {
              const parsed = JSON.parse(event.data);

              // Check for custom generative_ui event from backend
              if (parsed.type === 'generative_ui' && parsed.component) {
                const componentEvent: GenerativeUIEvent = {
                  id: `ui-${Date.now()}-${Math.random()
                    .toString(36)
                    .substr(2, 9)}`,
                  type: parsed.component, // e.g., "day_view", "todo_list", "calendar_view"
                  props: parsed.props || {},
                  timestamp: Date.now(),
                };
                console.log(
                  '[FRONTEND-WS] >>> Received generative_ui event:',
                  componentEvent.type,
                  'props_keys:',
                  Object.keys(componentEvent.props)
                );
                uiComponentCallbackRef.current?.(componentEvent);
                return; // Don't process as regular ADK event
              }

              // Regular ADK event processing
              const adkEvent = parsed as ADKEvent;

              // Check for audio data in the event
              if (adkEvent.content?.parts) {
                for (const part of adkEvent.content.parts) {
                  if (part.inlineData?.mimeType?.includes('audio')) {
                    // Forward audio payload as base64 to avoid costly decode/re-encode
                    // in JS, which can add jitter and playback artifacts.
                    const normalizedBase64 = part.inlineData.data
                      .replace(/-/g, '+')
                      .replace(/_/g, '/')
                      .replace(/\s/g, '');
                    audioCallbackRef.current?.(
                      normalizedBase64,
                      part.inlineData.mimeType
                    );
                  }
                }
              }

              eventCallbackRef.current?.(adkEvent);
            } catch (e) {
              console.error('Failed to parse WebSocket message:', e);
            }
          } else if (event.data instanceof ArrayBuffer) {
            // Binary audio data
            audioCallbackRef.current?.(event.data);
          } else if (event.data instanceof Blob) {
            // Convert Blob to ArrayBuffer
            event.data.arrayBuffer().then((buffer) => {
              audioCallbackRef.current?.(buffer);
            });
          }
        };

        wsRef.current = ws;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        setState({
          isConnected: false,
          isConnecting: false,
          error: errorMessage,
        });
      }
    },
    [accessToken, getWebSocketUrl]
  );

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState((prev) => {
      if (!prev.isConnected && !prev.isConnecting && prev.error === null) {
        return prev;
      }
      return { isConnected: false, isConnecting: false, error: null };
    });
  }, []);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioData);
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
    }
  }, []);

  const onEvent = useCallback((callback: (event: ADKEvent) => void) => {
    eventCallbackRef.current = callback;
  }, []);

  const onAudio = useCallback(
    (
      callback: (audioData: ArrayBuffer | string, mimeType?: string) => void
    ) => {
      audioCallbackRef.current = callback;
    },
    []
  );

  const onUIComponent = useCallback(
    (callback: (component: GenerativeUIEvent) => void) => {
      uiComponentCallbackRef.current = callback;
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    connect,
    disconnect,
    sendAudio,
    sendText,
    onEvent,
    onAudio,
    onUIComponent,
  };
}
