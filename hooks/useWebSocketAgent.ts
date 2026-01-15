import { useCallback, useEffect, useRef, useState } from "react";

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
    parts?: Array<{
      text?: string;
      inlineData?: {
        mimeType: string;
        data: string;
      };
      functionCall?: {
        name: string;
        args: Record<string, unknown>;
      };
    }>;
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

export interface UseWebSocketAgentReturn {
  state: WebSocketState;
  connect: () => void;
  disconnect: () => void;
  sendAudio: (audioData: ArrayBuffer) => void;
  sendText: (text: string) => void;
  onEvent: (callback: (event: ADKEvent) => void) => void;
  onAudio: (callback: (audioData: ArrayBuffer) => void) => void;
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
  userId: string = `user-${Date.now()}`,
  sessionId: string = `session-${Date.now()}`
): UseWebSocketAgentReturn {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const eventCallbackRef = useRef<((event: ADKEvent) => void) | null>(null);
  const audioCallbackRef = useRef<((audioData: ArrayBuffer) => void) | null>(
    null
  );
  const uiComponentCallbackRef = useRef<
    ((component: GenerativeUIEvent) => void) | null
  >(null);

  const getWebSocketUrl = useCallback(() => {
    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!baseUrl) {
      throw new Error("EXPO_PUBLIC_BACKEND_URL not configured");
    }
    // Convert http(s) to ws(s)
    const wsUrl = baseUrl.replace(/^http/, "ws");
    return `${wsUrl}/ws/${userId}/${sessionId}`;
  }, [userId, sessionId]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("WebSocket already connected");
      return;
    }

    setState({ isConnected: false, isConnecting: true, error: null });

    try {
      const url = getWebSocketUrl();
      console.log("Connecting to WebSocket:", url);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setState({ isConnected: true, isConnecting: false, error: null });
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        setState({ isConnected: false, isConnecting: false, error: null });
        wsRef.current = null;
      };

      ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        setState({
          isConnected: false,
          isConnecting: false,
          error: "Connection failed",
        });
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          // JSON event from server
          try {
            const parsed = JSON.parse(event.data) as ADKEvent;

            // Check for audio data in the event
            if (parsed.content?.parts) {
              for (const part of parsed.content.parts) {
                if (part.inlineData?.mimeType?.includes("audio")) {
                  // Decode base64 audio and send to callback
                  let base64 = part.inlineData.data;
                  // Fix URL-safe base64 and remove whitespace
                  base64 = base64
                    .replace(/-/g, "+")
                    .replace(/_/g, "/")
                    .replace(/\s/g, "");
                  const binaryString = atob(base64);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  audioCallbackRef.current?.(bytes.buffer);
                }

                // Check for function calls (Generative UI triggers)
                // Support both camelCase (old SDK) and snake_case (new SDK/Python)
                const funcCall = part.functionCall || (part as any).function_call;

                if (funcCall) {
                  const uiComponentTypes = [
                    "render_day_view",
                    "render_task_card",
                    "render_time_slots",
                    "render_schedule_picker",
                    "render_goal_progress",
                    "render_day_summary",
                    "show_confirmation",
                    "render_current_focus",
                  ];

                  if (uiComponentTypes.includes(funcCall.name)) {
                    const componentEvent: GenerativeUIEvent = {
                      id: `ui-${Date.now()}-${Math.random()
                        .toString(36)
                        .substr(2, 9)}`,
                      type: funcCall.name
                        .replace("render_", "")
                        .replace("show_", ""),
                      props: funcCall.args,
                      timestamp: Date.now(),
                    };
                    uiComponentCallbackRef.current?.(componentEvent);
                  }
                }
              }
            }

            eventCallbackRef.current?.(parsed);
          } catch (e) {
            console.error("Failed to parse WebSocket message:", e);
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
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setState({
        isConnected: false,
        isConnecting: false,
        error: errorMessage,
      });
    }
  }, [getWebSocketUrl]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState({ isConnected: false, isConnecting: false, error: null });
  }, []);

  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioData);
    }
  }, []);

  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text", text }));
    }
  }, []);

  const onEvent = useCallback((callback: (event: ADKEvent) => void) => {
    eventCallbackRef.current = callback;
  }, []);

  const onAudio = useCallback((callback: (audioData: ArrayBuffer) => void) => {
    audioCallbackRef.current = callback;
  }, []);

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
