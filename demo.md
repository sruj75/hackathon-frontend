Gemini Live API React Demo
A React-based client for Google's Gemini Live API, featuring real-time audio/video streaming and a WebSocket proxy for secure authentication.

Quick Start
1. Backend Setup
Install Python dependencies and start the proxy server:

# Install dependencies
pip install -r requirements.txt

# Authenticate with Google Cloud
gcloud auth application-default login

# Start the proxy server
python server.py
2. Frontend Setup
In a new terminal, start the React application:

Ensure you have Node.js and npm installed. If not, download and install them from nodejs.org.

# Install Node modules
npm install

# Start development server
npm run dev
Open http://localhost:5173 to view the app.

Features
Real-time Streaming: Audio and video streaming to Gemini.
React Components: Modular UI with LiveAPIDemo.jsx.
Secure Proxy: Python backend handles Google Cloud authentication.
Custom Tools: Support for defining client-side tools.
Media Handling: dedicated audio capture and playback processors.
Project Structure
/
├── server.py           # WebSocket proxy & auth handler
├── src/
│   ├── components/
│   │   └── LiveAPIDemo.jsx  # Main application logic
│   ├── utils/
│   │   ├── gemini-api.js    # Gemini WebSocket client
│   │   └── media-utils.js   # Audio/Video processing
│   └── App.jsx              # Root component
└── public/
    └── audio-processors/    # Audio worklets
Core APIs
GeminiLiveAPI
Located in src/utils/gemini-api.js, this class manages the WebSocket connection.

import { GeminiLiveAPI } from "./utils/gemini-api";

const client = new GeminiLiveAPI(
  "ws://localhost:8080",
  "your-project-id",
  "gemini-2.0-flash-exp"
);

client.connect();
client.sendText("Hello Gemini");
Media Integration
The app uses AudioWorklets for low-latency audio processing:

capture.worklet.js: Handles microphone input.
playback.worklet.js: Handles PCM audio output.
Configuration
Model: Defaults to gemini-live-2.5-flash-native-audio
Voice: Configurable in LiveAPIDemo.jsx (Puck, Charon, etc.)
Proxy Port: Default 8080 (set in server.py)



gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/public/audio-processors/capture.worklet.js

/**
 * Audio Worklet Processor for capturing and processing audio
 */

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input && input.length > 0) {
      const inputChannel = input[0];

      // Buffer the incoming audio
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];
        // When buffer is full, send it to main thread
        if (this.bufferIndex >= this.bufferSize) {
          // Send the buffered audio to the main thread
          this.port.postMessage({
            type: "audio",
            data: this.buffer.slice(),
          });

          // Reset buffer
          this.bufferIndex = 0;
        }
      }
    }

    // Return true to keep the processor alive
    return true;
  }
}

// Register the processor
registerProcessor("audio-capture-processor", AudioCaptureProcessor);



gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/public/audio-processors/playback.worklet.js

/**
 * Audio Playback Worklet Processor for playing PCM audio
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.audioQueue = [];

    this.port.onmessage = (event) => {
      if (event.data === "interrupt") {
        // Clear the queue on interrupt
        this.audioQueue = [];
      } else if (event.data instanceof Float32Array) {
        // Add audio data to the queue
        this.audioQueue.push(event.data);
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (output.length === 0) return true;

    const channel = output[0];
    let outputIndex = 0;

    // Fill the output buffer from the queue
    while (outputIndex < channel.length && this.audioQueue.length > 0) {
      const currentBuffer = this.audioQueue[0];

      if (!currentBuffer || currentBuffer.length === 0) {
        this.audioQueue.shift();
        continue;
      }

      const remainingOutput = channel.length - outputIndex;
      const remainingBuffer = currentBuffer.length;
      const copyLength = Math.min(remainingOutput, remainingBuffer);

      // Copy audio data to output
      for (let i = 0; i < copyLength; i++) {
        channel[outputIndex++] = currentBuffer[i];
      }

      // Update or remove the current buffer
      if (copyLength < remainingBuffer) {
        this.audioQueue[0] = currentBuffer.slice(copyLength);
      } else {
        this.audioQueue.shift();
      }
    }

    // Fill remaining output with silence
    while (outputIndex < channel.length) {
      channel[outputIndex++] = 0;
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);




gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/components/LiveAPIDemo.css

:root {
  /* Google Brand Colors */
  --google-blue: #4285f4;
  --google-red: #db4437;
  --google-yellow: #f4b400;
  --google-green: #0f9d58;
  --toolbar-height: 60px;
}

body {
  margin: 0;
  padding: 0;
  font-family: 'Robotica', Arial, sans-serif;
  background-color: #f8f9fa;
  color: #202124;
}

.live-api-demo {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* Toolbar Styles */
.toolbar {
  height: var(--toolbar-height);
  background-color: white;
  border-bottom: 1px solid #dadce0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  z-index: 1000;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
}

.toolbar-left h1 {
  margin: 0;
  font-size: 1.2rem;
  color: #202124;
  font-weight: 500;
}

.toolbar-center {
  display: flex;
  gap: 20px;
  margin-left: 40px;
}



/* Dropdown Styles */
.dropdown {
  position: relative;
  display: inline-block;
}

.dropbtn {
  background-color: transparent;
  color: #3c4043;
  padding: 10px 15px;
  font-size: 14px;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  font-weight: 500;
}

.dropdown:hover .dropbtn {
  background-color: #f1f3f4;
  color: #202124;
}

.dropdown-content {
  display: none;
  position: absolute;
  background-color: white;
  min-width: 300px;
  box-shadow: 0 8px 16px 0 rgba(0, 0, 0, 0.2);
  z-index: 1;
  border-radius: 8px;
  padding: 15px;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  max-height: 80vh;
  overflow-y: auto;
  border: 1px solid #dadce0;
  text-align: left;
}

/* Specific widths for different dropdowns */
.config-dropdown {
  min-width: 400px;
}

.media-dropdown {
  min-width: 350px;
}

.chat-dropdown {
  min-width: 350px;
}

.dropdown:hover .dropdown-content {
  display: block;
}



.debug-info {
  position: fixed;
  bottom: 10px;
  left: 10px;
  max-width: 300px;
  opacity: 0.7;
  font-size: 0.8rem;
  text-align: left;
}

/* Existing Component Styles (Adapted) */
.control-group {
  margin-bottom: 15px;
  border: 1px solid #eee;
  padding: 10px;
  border-radius: 8px;
}

.control-group h3 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1rem;
  color: #202124;
}

.input-group {
  margin-bottom: 10px;
  text-align: left;
}

.input-group label {
  display: block;
  margin-bottom: 5px;
  font-size: 0.9rem;
  color: #5f6368;
}

.input-group input[type="text"],
.input-group input[type="number"],
.input-group select,
.input-group textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #dadce0;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 14px;
  color: #202124;
  background-color: white;
}

.checkbox-group {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  text-align: left;
  font-size: 0.9rem;
  color: #202124;
}

.checkbox-group input {
  margin-right: 10px;
}

.button-group-vertical {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 15px 0;
}

button {
  padding: 8px 16px;
  background-color: white;
  border: 1px solid #dadce0;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  color: #3c4043;
  transition: all 0.2s;
}

button:hover {
  background-color: #f1f3f4;
  color: #202124;
  border-color: #dadce0;
}

button.active {
  background-color: #e8f0fe;
  color: var(--google-blue);
  border-color: var(--google-blue);
}

button.disconnect {
  background-color: var(--google-red);
  color: white;
  border-color: var(--google-red);
}

button.disconnect:hover {
  background-color: #c5221f;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.video-preview {
  width: 100%;
  background-color: black;
  border-radius: 8px;
  margin-top: 10px;
}

.chat-container {
  height: 300px;
  overflow-y: auto;
  border: 1px solid #dadce0;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  background-color: #f8f9fa;
  text-align: left;
}

.chat-input-area {
  display: flex;
  gap: 10px;
}

.chat-input-area input {
  flex: 1;
}

.message {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 8px;
  font-size: 0.9rem;
  line-height: 1.4;
}

.user {
  background-color: #e8f0fe;
  color: #1a73e8;
  align-self: flex-end;
}

.assistant {
  background-color: white;
  border: 1px solid #dadce0;
  color: #202124;
}

.system {
  font-style: italic;
  color: #5f6368;
  font-size: 0.8rem;
}

.setup-json-display {
  background-color: #f1f3f4;
  padding: 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  overflow-x: hidden;
  white-space: pre-wrap;
  word-wrap: break-word;
}


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/components/LiveAPIDemo.jsx

import React, { useState, useEffect, useRef } from "react";
import { GeminiLiveAPI, MultimodalLiveResponseType } from "../utils/gemini-api";
import {
  AudioStreamer,
  VideoStreamer,
  ScreenCapture,
  AudioPlayer,
} from "../utils/media-utils";
import { ShowAlertTool, AddCSSStyleTool } from "../utils/tools";
import "./LiveAPIDemo.css";

const LiveAPIDemo = () => {
  // Connection State
  const [connected, setConnected] = useState(false);
  const [debugInfo, setDebugInfo] = useState("Ready to connect...");
  const [setupJson, setSetupJson] = useState(null);

  // Configuration State
  const [proxyUrl, setProxyUrl] = useState(
    localStorage.getItem("proxyUrl") || "ws://localhost:8080"
  );
  const [projectId, setProjectId] = useState(
    localStorage.getItem("projectId") || ""
  );
  const [model, setModel] = useState(
    localStorage.getItem("model") ||
      "gemini-live-2.5-flash-native-audio"
  );

  useEffect(() => {
    localStorage.setItem("proxyUrl", proxyUrl);
    localStorage.setItem("projectId", projectId);
    localStorage.setItem("model", model);
  }, [proxyUrl, projectId, model]);
  const [systemInstructions, setSystemInstructions] = useState(
    "You are a helpful assistant. Be concise and friendly."
  );
  const [voice, setVoice] = useState("Puck");
  const [temperature, setTemperature] = useState(1.0);
  const [enableProactiveAudio, setEnableProactiveAudio] = useState(true);
  const [enableGrounding, setEnableGrounding] = useState(false);
  const [enableAffectiveDialog, setEnableAffectiveDialog] = useState(true);
  const [enableAlertTool, setEnableAlertTool] = useState(true);
  const [enableCssStyleTool, setEnableCssStyleTool] = useState(true);
  const [enableInputTranscription, setEnableInputTranscription] =
    useState(true);
  const [enableOutputTranscription, setEnableOutputTranscription] =
    useState(true);

  // Activity Detection State
  const [disableActivityDetection, setDisableActivityDetection] =
    useState(false);
  const [silenceDuration, setSilenceDuration] = useState(500);
  const [prefixPadding, setPrefixPadding] = useState(500);
  const [endSpeechSensitivity, setEndSpeechSensitivity] = useState(
    "END_SENSITIVITY_UNSPECIFIED"
  );
  const [startSpeechSensitivity, setStartSpeechSensitivity] = useState(
    "START_SENSITIVITY_UNSPECIFIED"
  );

  // Media State
  const [audioStreaming, setAudioStreaming] = useState(false);
  const [videoStreaming, setVideoStreaming] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [volume, setVolume] = useState(80);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [videoInputDevices, setVideoInputDevices] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");

  // Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Refs
  const clientRef = useRef(null);
  const audioStreamerRef = useRef(null);
  const videoStreamerRef = useRef(null);
  const screenCaptureRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Initialize Media Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioInputDevices(
          devices.filter((device) => device.kind === "audioinput")
        );
        setVideoInputDevices(
          devices.filter((device) => device.kind === "videoinput")
        );
      } catch (error) {
        console.error("Error enumerating devices:", error);
      }
    };
    getDevices();
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const addMessage = (text, type, mode = "add", isFinished = false) => {
    setChatMessages((prev) => {
      // Check if we can modify the last message
      if (
        mode !== "add" &&
        prev.length > 0 &&
        prev[prev.length - 1].type === type &&
        !prev[prev.length - 1].isFinished
      ) {
        const newMessages = [...prev];
        // Create a shallow copy of the message to avoid mutating state directly
        const target = { ...newMessages[newMessages.length - 1] };
        newMessages[newMessages.length - 1] = target;

        if (mode === "append") {
          target.text += text;
        } else if (mode === "replace") {
          // Only replace if text is provided and not just whitespace
          if (text && text.trim().length > 0) {
            target.text = text;
          }
        }

        if (isFinished) {
          target.isFinished = true;
        }
        return newMessages;
      }

      // Create new message
      // Don't create empty messages
      if ((!text || text.trim().length === 0) && !isFinished) return prev;

      return [...prev, { text: text || "", type, isFinished }];
    });
  };

  const handleMessage = (message) => {
    setDebugInfo(`Message: ${message.type}`);

    switch (message.type) {
      case MultimodalLiveResponseType.TEXT:
        addMessage(message.data, "assistant");
        break;
      case MultimodalLiveResponseType.AUDIO:
        if (audioPlayerRef.current) {
          audioPlayerRef.current.play(message.data);
        }
        break;
      case MultimodalLiveResponseType.INPUT_TRANSCRIPTION:
        addMessage(
          message.data.text,
          "user-transcript",
          "append",
          message.data.finished
        );
        break;
      case MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION:
        addMessage(
          message.data.text,
          "assistant",
          "append",
          message.data.finished
        );
        break;
      case MultimodalLiveResponseType.SETUP_COMPLETE:
        addMessage("Ready!", "system");
        if (clientRef.current && clientRef.current.lastSetupMessage) {
          setSetupJson(clientRef.current.lastSetupMessage);
        }
        break;
      case MultimodalLiveResponseType.TOOL_CALL: {
        const functionCalls = message.data.functionCalls;
        functionCalls.forEach((functionCall) => {
          const { name, args } = functionCall;
          console.log(
            `Calling function ${name} with parameters: ${JSON.stringify(args)}`
          );
          clientRef.current.callFunction(name, args);
        });
        break;
      }
      case MultimodalLiveResponseType.TURN_COMPLETE:
        setDebugInfo("Turn complete");
        break;
      case MultimodalLiveResponseType.INTERRUPTED:
        addMessage("[Interrupted]", "system");
        if (audioPlayerRef.current) {
          audioPlayerRef.current.interrupt();
        }
        break;
      default:
        break;
    }
  };

  const disconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }

    if (audioStreamerRef.current) {
      audioStreamerRef.current.stop();
      audioStreamerRef.current = null;
    }
    if (videoStreamerRef.current) {
      videoStreamerRef.current.stop();
      videoStreamerRef.current = null;
    }
    if (screenCaptureRef.current) {
      screenCaptureRef.current.stop();
      screenCaptureRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.destroy();
      audioPlayerRef.current = null;
    }

    setConnected(false);
    setAudioStreaming(false);
    setVideoStreaming(false);
    setScreenSharing(false);

    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
      videoPreviewRef.current.hidden = true;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const connect = async () => {
    if (!proxyUrl && !projectId) {
      alert("Please provide either a Proxy URL and Project ID");
      return;
    }

    try {
      clientRef.current = new GeminiLiveAPI(proxyUrl, projectId, model);

      clientRef.current.systemInstructions = systemInstructions;
      clientRef.current.inputAudioTranscription = enableInputTranscription;
      clientRef.current.outputAudioTranscription = enableOutputTranscription;
      clientRef.current.googleGrounding = enableGrounding;
      clientRef.current.enableAffectiveDialog = enableAffectiveDialog;
      clientRef.current.responseModalities = ["AUDIO"];
      clientRef.current.voiceName = voice;
      clientRef.current.temperature = parseFloat(temperature);
      clientRef.current.proactivity = {
        proactiveAudio: enableProactiveAudio,
      };
      clientRef.current.automaticActivityDetection = {
        disabled: disableActivityDetection,
        silence_duration_ms: parseInt(silenceDuration),
        prefix_padding_ms: parseInt(prefixPadding),
        end_of_speech_sensitivity: endSpeechSensitivity,
        start_of_speech_sensitivity: startSpeechSensitivity,
      };

      if (!enableGrounding) {
        if (enableAlertTool) {
          clientRef.current.addFunction(new ShowAlertTool());
        }
        if (enableCssStyleTool) {
          clientRef.current.addFunction(new AddCSSStyleTool());
        }
      }

      clientRef.current.onReceiveResponse = handleMessage;
      clientRef.current.onErrorMessage = (error) => {
        console.error("Error:", error);
        setDebugInfo("Error: " + error);
      };
      clientRef.current.onConnectionStarted = () => {
        setConnected(true);
      };
      clientRef.current.onClose = () => {
        setConnected(false);
        disconnect();
      };

      await clientRef.current.connect();

      audioStreamerRef.current = new AudioStreamer(clientRef.current);
      videoStreamerRef.current = new VideoStreamer(clientRef.current);
      screenCaptureRef.current = new ScreenCapture(clientRef.current);
      audioPlayerRef.current = new AudioPlayer();
      await audioPlayerRef.current.init();
      audioPlayerRef.current.setVolume(volume / 100);

      setDebugInfo("Connected successfully");
    } catch (error) {
      console.error("Connection failed:", error);
      setDebugInfo("Error: " + error.message);
    }
  };

  const toggleAudio = async () => {
    if (!audioStreaming) {
      try {
        if (!audioStreamerRef.current && clientRef.current) {
          audioStreamerRef.current = new AudioStreamer(clientRef.current);
        }

        if (audioStreamerRef.current) {
          await audioStreamerRef.current.start(selectedMic);
          setAudioStreaming(true);
          addMessage("[Microphone on]", "system");
        } else {
          addMessage("[Connect to Gemini first]", "system");
        }
      } catch (error) {
        addMessage("[Audio error: " + error.message + "]", "system");
      }
    } else {
      if (audioStreamerRef.current) audioStreamerRef.current.stop();
      setAudioStreaming(false);
      addMessage("[Microphone off]", "system");
    }
  };

  const toggleVideo = async () => {
    if (!videoStreaming) {
      try {
        if (!videoStreamerRef.current && clientRef.current) {
          videoStreamerRef.current = new VideoStreamer(clientRef.current);
        }

        if (videoStreamerRef.current) {
          const video = await videoStreamerRef.current.start({
            deviceId: selectedCamera,
          });
          setVideoStreaming(true);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = video.srcObject;
            videoPreviewRef.current.hidden = false;
          }
          addMessage("[Camera on]", "system");
        } else {
          addMessage("[Connect to Gemini first]", "system");
        }
      } catch (error) {
        addMessage("[Video error: " + error.message + "]", "system");
      }
    } else {
      if (videoStreamerRef.current) videoStreamerRef.current.stop();
      setVideoStreaming(false);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
        videoPreviewRef.current.hidden = true;
      }
      addMessage("[Camera off]", "system");
    }
  };

  const toggleScreen = async () => {
    if (!screenSharing) {
      try {
        if (!screenCaptureRef.current && clientRef.current) {
          screenCaptureRef.current = new ScreenCapture(clientRef.current);
        }

        if (screenCaptureRef.current) {
          const video = await screenCaptureRef.current.start();
          setScreenSharing(true);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = video.srcObject;
            videoPreviewRef.current.hidden = false;
          }
          addMessage("[Screen sharing on]", "system");
        } else {
          addMessage("[Connect to Gemini first]", "system");
        }
      } catch (error) {
        addMessage("[Screen share error: " + error.message + "]", "system");
      }
    } else {
      if (screenCaptureRef.current) screenCaptureRef.current.stop();
      setScreenSharing(false);
      if (!videoStreaming && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
        videoPreviewRef.current.hidden = true;
      }
      addMessage("[Screen sharing off]", "system");
    }
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;

    if (clientRef.current) {
      addMessage(chatInput, "user");
      clientRef.current.sendTextMessage(chatInput);
      setChatInput("");
    } else {
      addMessage("[Connect to Gemini first]", "system");
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = e.target.value;
    setVolume(newVolume);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(newVolume / 100);
    }
  };

  return (
    <div className="live-api-demo">
      <div className="toolbar">
        <div className="toolbar-left">
          <h1>Gemini Live API React Demo</h1>
        </div>
        <div className="toolbar-center">
          <div className="dropdown">
            <button className="dropbtn">Configuration ▾</button>
            <div className="dropdown-content config-dropdown">
              {/* API Configuration Section */}
              <div className="control-group">
                <h3>Connection Settings</h3>
                <div className="input-group">
                  <label>Proxy WebSocket URL:</label>
                  <input
                    type="text"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="ws://localhost:8080"
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Project ID:</label>
                  <input
                    type="text"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Model ID:</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={connected}
                  />
                </div>
              </div>

              <div className="control-group">
                <h3>Gemini Behavior</h3>
                <div className="input-group">
                  <label>System Instructions:</label>
                  <textarea
                    rows="3"
                    value={systemInstructions}
                    onChange={(e) => setSystemInstructions(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Voice:</label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    disabled={connected}
                  >
                    <option value="Puck">Puck (Default)</option>
                    <option value="Charon">Charon</option>
                    <option value="Kore">Kore</option>
                    <option value="Fenrir">Fenrir</option>
                    <option value="Aoede">Aoede</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Temperature: {temperature}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    disabled={connected}
                  />
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableProactiveAudio}
                    onChange={(e) => setEnableProactiveAudio(e.target.checked)}
                    disabled={connected}
                  />
                  <label>Enable proactive audio</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableGrounding}
                    onChange={(e) => setEnableGrounding(e.target.checked)}
                    disabled={connected}
                  />
                  <label>Enable Google grounding</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableAffectiveDialog}
                    onChange={(e) => setEnableAffectiveDialog(e.target.checked)}
                    disabled={connected}
                  />
                  <label>Enable affective dialog</label>
                </div>
              </div>

              <div className="control-group">
                <h3>Custom Tools</h3>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableAlertTool}
                    onChange={(e) => setEnableAlertTool(e.target.checked)}
                    disabled={connected || enableGrounding}
                  />
                  <label>Show Alert Box</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableCssStyleTool}
                    onChange={(e) => setEnableCssStyleTool(e.target.checked)}
                    disabled={connected || enableGrounding}
                  />
                  <label>Add CSS Style</label>
                </div>
              </div>

              <div className="control-group">
                <h3>Transcription Settings</h3>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableInputTranscription}
                    onChange={(e) =>
                      setEnableInputTranscription(e.target.checked)
                    }
                    disabled={connected}
                  />
                  <label>Enable input transcription</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={enableOutputTranscription}
                    onChange={(e) =>
                      setEnableOutputTranscription(e.target.checked)
                    }
                    disabled={connected}
                  />
                  <label>Enable output transcription</label>
                </div>
              </div>

              <div className="control-group">
                <h3>Activity Detection Settings</h3>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    checked={disableActivityDetection}
                    onChange={(e) =>
                      setDisableActivityDetection(e.target.checked)
                    }
                    disabled={connected}
                  />
                  <label>Disable automatic activity detection</label>
                </div>
                <div className="input-group">
                  <label>Silence duration (ms):</label>
                  <input
                    type="number"
                    value={silenceDuration}
                    onChange={(e) => setSilenceDuration(e.target.value)}
                    min="500"
                    max="10000"
                    step="100"
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>Prefix padding (ms):</label>
                  <input
                    type="number"
                    value={prefixPadding}
                    onChange={(e) => setPrefixPadding(e.target.value)}
                    min="0"
                    max="2000"
                    step="100"
                    disabled={connected}
                  />
                </div>
                <div className="input-group">
                  <label>End of speech sensitivity:</label>
                  <select
                    value={endSpeechSensitivity}
                    onChange={(e) => setEndSpeechSensitivity(e.target.value)}
                    disabled={connected}
                  >
                    <option value="END_SENSITIVITY_UNSPECIFIED">Default</option>
                    <option value="END_SENSITIVITY_HIGH">High</option>
                    <option value="END_SENSITIVITY_LOW">Low</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Start of speech sensitivity:</label>
                  <select
                    value={startSpeechSensitivity}
                    onChange={(e) => setStartSpeechSensitivity(e.target.value)}
                    disabled={connected}
                  >
                    <option value="START_SENSITIVITY_UNSPECIFIED">
                      Default
                    </option>
                    <option value="START_SENSITIVITY_HIGH">High</option>
                    <option value="START_SENSITIVITY_LOW">Low</option>
                  </select>
                </div>
              </div>

              {setupJson && (
                <div className="control-group">
                  <h3>Setup Message JSON</h3>
                  <pre className="setup-json-display">
                    {JSON.stringify(setupJson, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={connected ? disconnect : connect}
            className={connected ? "disconnect" : "active"}
          >
            {connected ? "Disconnect" : "Connect"}
          </button>

          <div className="dropdown">
            <button className="dropbtn">Media ▾</button>
            <div className="dropdown-content media-dropdown">
              {/* Media Streaming Section */}
              <div className="control-group">
                <div className="input-group">
                  <label>Microphone:</label>
                  <select
                    value={selectedMic}
                    onChange={(e) => setSelectedMic(e.target.value)}
                  >
                    <option value="">Default Microphone</option>
                    {audioInputDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Camera:</label>
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                  >
                    <option value="">Default Camera</option>
                    {videoInputDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="button-group-vertical">
                  <button
                    onClick={toggleAudio}
                    className={audioStreaming ? "active" : ""}
                  >
                    {audioStreaming ? "Stop Audio" : "Start Audio"}
                  </button>
                  <button
                    onClick={toggleVideo}
                    className={videoStreaming ? "active" : ""}
                  >
                    {videoStreaming ? "Stop Video" : "Start Video"}
                  </button>
                  <button
                    onClick={toggleScreen}
                    className={screenSharing ? "active" : ""}
                  >
                    {screenSharing ? "Stop Sharing" : "Share Screen"}
                  </button>
                </div>

                <div className="input-group">
                  <label>Output volume: {volume}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={handleVolumeChange}
                  />
                </div>

                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  hidden
                  className="video-preview"
                />
              </div>
            </div>
          </div>

          <div className="dropdown">
            <button className="dropbtn">Chat ▾</button>
            <div className="dropdown-content chat-dropdown">
              {/* Chat Section */}
              <div className="chat-container" ref={chatContainerRef}>
                {chatMessages.length === 0 && (
                  <div>Connect to Gemini to start chatting</div>
                )}
                {chatMessages.map((msg, index) => (
                  <div key={index} className={`message ${msg.type}`}>
                    {msg.text}
                  </div>
                ))}
              </div>
              <div className="chat-input-area">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                />
                <button onClick={sendMessage}>Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Info Section */}
      <div className="debug-info">
        <pre className="setup-json-display">{debugInfo}</pre>
      </div>
    </div>
  );
};

export default LiveAPIDemo;


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/utils/gemini-api.js

/**
 * Gemini Live API Utilities
 */

// Response type constants
export const MultimodalLiveResponseType = {
  TEXT: "TEXT",
  AUDIO: "AUDIO",
  SETUP_COMPLETE: "SETUP COMPLETE",
  INTERRUPTED: "INTERRUPTED",
  TURN_COMPLETE: "TURN COMPLETE",
  TOOL_CALL: "TOOL_CALL",
  ERROR: "ERROR",
  INPUT_TRANSCRIPTION: "INPUT_TRANSCRIPTION",
  OUTPUT_TRANSCRIPTION: "OUTPUT_TRANSCRIPTION",
};

/**
 * Parses response messages from the Gemini Live API
 */
export class MultimodalLiveResponseMessage {
  constructor(data) {
    this.data = "";
    this.type = "";
    this.endOfTurn = false;

    // console.log("raw message data: ", data);
    this.endOfTurn = data?.serverContent?.turnComplete;

    const parts = data?.serverContent?.modelTurn?.parts;

    try {
      if (data?.setupComplete) {
        // console.log("🏁 SETUP COMPLETE response", data);
        this.type = MultimodalLiveResponseType.SETUP_COMPLETE;
      } else if (data?.serverContent?.turnComplete) {
        // console.log("🏁 TURN COMPLETE response");
        this.type = MultimodalLiveResponseType.TURN_COMPLETE;
      } else if (data?.serverContent?.interrupted) {
        // console.log("🗣️ INTERRUPTED response");
        this.type = MultimodalLiveResponseType.INTERRUPTED;
      } else if (data?.serverContent?.inputTranscription) {
        // console.log(
        //   "📝 INPUT TRANSCRIPTION:",
        //   data.serverContent.inputTranscription
        // );
        this.type = MultimodalLiveResponseType.INPUT_TRANSCRIPTION;
        this.data = {
          text: data.serverContent.inputTranscription.text || "",
          finished: data.serverContent.inputTranscription.finished || false,
        };
      } else if (data?.serverContent?.outputTranscription) {
        // console.log(
        //   "📝 OUTPUT TRANSCRIPTION:",
        //   data.serverContent.outputTranscription
        // );
        this.type = MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION;
        this.data = {
          text: data.serverContent.outputTranscription.text || "",
          finished: data.serverContent.outputTranscription.finished || false,
        };
      } else if (data?.toolCall) {
        // console.log("🎯 🛠️ TOOL CALL response", data?.toolCall);
        this.type = MultimodalLiveResponseType.TOOL_CALL;
        this.data = data?.toolCall;
      } else if (parts?.length && parts[0].text) {
        // console.log("💬 TEXT response", parts[0].text);
        this.data = parts[0].text;
        this.type = MultimodalLiveResponseType.TEXT;
      } else if (parts?.length && parts[0].inlineData) {
        // console.log("🔊 AUDIO response");
        this.data = parts[0].inlineData.data;
        this.type = MultimodalLiveResponseType.AUDIO;
      }
    } catch (e) {
      console.log("⚠️ Error parsing response data: ", data);
    }
  }
}

/**
 * Function call definition for tool use
 */
export class FunctionCallDefinition {
  constructor(name, description, parameters, requiredParameters) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.requiredParameters = requiredParameters;
  }

  functionToCall(parameters) {
    console.log("▶️Default function call");
  }

  getDefinition() {
    const definition = {
      name: this.name,
      description: this.description,
      parameters: { required: this.requiredParameters, ...this.parameters },
    };
    console.log("created FunctionDefinition: ", definition);
    return definition;
  }

  runFunction(parameters) {
    console.log(
      `⚡ Running ${this.name} function with parameters: ${JSON.stringify(
        parameters
      )}`
    );
    this.functionToCall(parameters);
  }
}

/**
 * Main Gemini Live API client
 */
export class GeminiLiveAPI {
  constructor(proxyUrl, projectId, model) {
    this.proxyUrl = proxyUrl;
    this.projectId = projectId;
    this.model = model;
    this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;
    this.responseModalities = ["AUDIO"];
    this.systemInstructions = "";
    this.googleGrounding = false;
    this.enableAffectiveDialog = false; // Default affective dialog
    this.voiceName = "Puck"; // Default voice
    this.temperature = 1.0; // Default temperature
    this.proactivity = { proactiveAudio: false }; // Proactivity config
    this.inputAudioTranscription = false;
    this.outputAudioTranscription = false;
    this.enableFunctionCalls = false;
    this.functions = [];
    this.functionsMap = {};
    this.previousImage = null;
    this.totalBytesSent = 0;

    // Automatic activity detection settings with defaults
    this.automaticActivityDetection = {
      disabled: false,
      silence_duration_ms: 2000,
      prefix_padding_ms: 500,
      end_of_speech_sensitivity: "END_SENSITIVITY_UNSPECIFIED",
      start_of_speech_sensitivity: "START_SENSITIVITY_UNSPECIFIED",
    };

    this.apiHost = "us-central1-aiplatform.googleapis.com";
    this.serviceUrl = `wss://${this.apiHost}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
    this.connected = false;
    this.webSocket = null;
    this.lastSetupMessage = null; // Store the last setup message

    // Default callbacks
    this.onReceiveResponse = (message) => {
      console.log("Default message received callback", message);
    };

    this.onConnectionStarted = () => {
      console.log("Default onConnectionStarted");
    };

    this.onErrorMessage = (message) => {
      alert(message);
      this.connected = false;
    };

    this.onClose = () => {
      console.log("Default onClose");
    };

    console.log("Created Gemini Live API object: ", this);
  }

  setProjectId(projectId) {
    this.projectId = projectId;
    this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;
  }

  setSystemInstructions(newSystemInstructions) {
    console.log("setting system instructions: ", newSystemInstructions);
    this.systemInstructions = newSystemInstructions;
  }

  setGoogleGrounding(newGoogleGrounding) {
    console.log("setting google grounding: ", newGoogleGrounding);
    this.googleGrounding = newGoogleGrounding;
  }

  setResponseModalities(modalities) {
    this.responseModalities = modalities;
  }

  setVoice(voiceName) {
    console.log("setting voice: ", voiceName);
    this.voiceName = voiceName;
  }

  setProactivity(proactivity) {
    console.log("setting proactivity: ", proactivity);
    this.proactivity = proactivity;
  }

  setInputAudioTranscription(enabled) {
    console.log("setting input audio transcription: ", enabled);
    this.inputAudioTranscription = enabled;
  }

  setOutputAudioTranscription(enabled) {
    console.log("setting output audio transcription: ", enabled);
    this.outputAudioTranscription = enabled;
  }

  setEnableFunctionCalls(enabled) {
    console.log("setting enable function calls: ", enabled);
    this.enableFunctionCalls = enabled;
  }

  addFunction(newFunction) {
    this.functions.push(newFunction);
    this.functionsMap[newFunction.name] = newFunction;
    console.log("added function: ", newFunction);
  }

  callFunction(functionName, parameters) {
    const functionToCall = this.functionsMap[functionName];
    if (functionToCall) {
      functionToCall.runFunction(parameters);
    } else {
      console.error(`Function ${functionName} not found`);
    }
  }

  connect() {
    this.setupWebSocketToService();
  }

  disconnect() {
    if (this.webSocket) {
      this.webSocket.close();
      this.connected = false;
    }
  }

  sendMessage(message) {
    // console.log("🟩 Sending message: ", message);
    if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
      this.webSocket.send(JSON.stringify(message));
    }
  }

  onReceiveMessage(messageEvent) {
    // console.log("Message received: ", messageEvent);
    const messageData = JSON.parse(messageEvent.data);
    const message = new MultimodalLiveResponseMessage(messageData);
    this.onReceiveResponse(message);
  }

  setupWebSocketToService() {
    console.log("connecting: ", this.proxyUrl);

    this.webSocket = new WebSocket(this.proxyUrl);

    this.webSocket.onclose = (event) => {
      console.log("websocket closed: ", event);
      this.connected = false;
      this.onClose(event);
    };

    this.webSocket.onerror = (event) => {
      console.log("websocket error: ", event);
      this.connected = false;
      this.onErrorMessage("Connection error");
    };

    this.webSocket.onopen = (event) => {
      console.log("websocket open: ", event);
      this.connected = true;
      this.totalBytesSent = 0;
      this.sendInitialSetupMessages();
      this.onConnectionStarted();
    };

    this.webSocket.onmessage = this.onReceiveMessage.bind(this);
  }

  getFunctionDefinitions() {
    console.log("🛠️ getFunctionDefinitions called");
    const tools = [];

    for (let index = 0; index < this.functions.length; index++) {
      const func = this.functions[index];
      tools.push(func.getDefinition());
    }
    return tools;
  }

  sendInitialSetupMessages() {
    const serviceSetupMessage = {
      service_url: this.serviceUrl,
    };
    this.sendMessage(serviceSetupMessage);

    const tools = this.getFunctionDefinitions();

    const sessionSetupMessage = {
      setup: {
        model: this.modelUri,
        generation_config: {
          response_modalities: this.responseModalities,
          temperature: this.temperature,
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: this.voiceName,
              },
            },
          },
        },
        system_instruction: { parts: [{ text: this.systemInstructions }] },
        tools: { function_declarations: tools },
        proactivity: this.proactivity,

        realtime_input_config: {
          automatic_activity_detection: this.automaticActivityDetection,
        },
      },
    };

    // Add transcription config if enabled
    if (this.inputAudioTranscription) {
      sessionSetupMessage.setup.input_audio_transcription = {};
    }
    if (this.outputAudioTranscription) {
      sessionSetupMessage.setup.output_audio_transcription = {};
    }

    if (this.googleGrounding) {
      sessionSetupMessage.setup.tools.google_search = {};
      // Currently can't have both Google Search with custom tools.
      console.log(
        "Google Grounding enabled, removing custom function calls if any."
      );
      delete sessionSetupMessage.setup.tools.function_declarations;
    }

    // Add affective dialog if enabled
    if (this.enableAffectiveDialog) {
      sessionSetupMessage.setup.generation_config.enable_affective_dialog = true;
    }

    // Store the setup message for later access
    this.lastSetupMessage = sessionSetupMessage;

    console.log("sessionSetupMessage: ", sessionSetupMessage);
    this.sendMessage(sessionSetupMessage);
  }

  sendTextMessage(text) {
    const textMessage = {
      client_content: {
        turns: [
          {
            role: "user",
            parts: [{ text: text }],
          },
        ],
        turn_complete: true,
      },
    };
    this.sendMessage(textMessage);
  }

  sendToolResponse(toolCallId, response) {
    const message = {
      tool_response: {
        id: toolCallId,
        response: response,
      },
    };
    console.log("🔧 Sending tool response:", message);
    this.sendMessage(message);
  }

  sendRealtimeInputMessage(data, mime_type) {
    const message = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: mime_type,
            data: data,
          },
        ],
      },
    };
    this.sendMessage(message);
    this.addToBytesSent(data);
  }

  addToBytesSent(data) {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    this.totalBytesSent += encodedData.length;
  }

  getBytesSent() {
    return this.totalBytesSent;
  }

  sendAudioMessage(base64PCM) {
    this.sendRealtimeInputMessage(base64PCM, "audio/pcm");
  }

  async sendImageMessage(base64Image, mime_type = "image/jpeg") {
    this.sendRealtimeInputMessage(base64Image, mime_type);
  }
}


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/utils/media-utils.js

/**
 * Media Utilities - Audio and Video streaming helpers for Gemini Live API
 */

/**
 * Audio Streamer - Captures and streams microphone audio
 */
export class AudioStreamer {
  constructor(geminiClient) {
    this.client = geminiClient;
    this.audioContext = null;
    this.audioWorklet = null;
    this.mediaStream = null;
    this.isStreaming = false;
    this.sampleRate = 16000; // Gemini requires 16kHz
  }

  /**
   * Start streaming audio from microphone
   * @param {string} deviceId - Optional device ID for specific microphone
   */
  async start(deviceId = null) {
    try {
      // Build audio constraints
      const audioConstraints = {
        sampleRate: this.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      // Add device ID if specified
      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      // Create audio context at 16kHz
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      // Load the audio worklet module
      await this.audioContext.audioWorklet.addModule(
        "/audio-processors/capture.worklet.js"
      );

      // Create the audio worklet node
      this.audioWorklet = new AudioWorkletNode(
        this.audioContext,
        "audio-capture-processor"
      );

      // Set up message handling from the worklet
      this.audioWorklet.port.onmessage = (event) => {
        if (!this.isStreaming) return;

        if (event.data.type === "audio") {
          const inputData = event.data.data;
          const pcmData = this.convertToPCM16(inputData);
          const base64Audio = this.arrayBufferToBase64(pcmData);

          // Send to Gemini
          if (this.client && this.client.connected) {
            this.client.sendAudioMessage(base64Audio);
          }
        }
      };

      // Connect the audio graph
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );
      source.connect(this.audioWorklet);

      this.isStreaming = true;
      console.log("🎤 Audio streaming started");
      return true;
    } catch (error) {
      console.error("Failed to start audio streaming:", error);
      throw error;
    }
  }

  /**
   * Stop audio streaming
   */
  stop() {
    this.isStreaming = false;

    if (this.audioWorklet) {
      this.audioWorklet.disconnect();
      this.audioWorklet.port.close();
      this.audioWorklet = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    console.log("🛑 Audio streaming stopped");
  }

  /**
   * Convert Float32Array to PCM16 Int16Array
   */
  convertToPCM16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = sample * 0x7fff;
    }
    return int16Array.buffer;
  }

  /**
   * Convert ArrayBuffer to base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

/**
 * Base Video Capture - Shared functionality for video/screen capture
 */
class BaseVideoCapture {
  constructor(geminiClient) {
    this.client = geminiClient;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.mediaStream = null;
    this.isStreaming = false;
    this.captureInterval = null;
    this.fps = 1; // Default 1 frame per second
    this.quality = 0.8; // Default JPEG quality
  }

  /**
   * Initialize canvas and video elements
   */
  initializeElements(width, height) {
    // Create video element
    this.video = document.createElement("video");
    this.video.srcObject = this.mediaStream;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;

    // Create canvas for frame capture
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
  }

  /**
   * Wait for video to be ready and start playing
   */
  async waitForVideoReady() {
    await new Promise((resolve) => {
      this.video.onloadedmetadata = resolve;
    });
    this.video.play();
  }

  /**
   * Start capturing and sending frames
   */
  startCapturing() {
    const captureFrame = () => {
      if (!this.isStreaming) return;

      // Draw current frame to canvas
      this.ctx.drawImage(
        this.video,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      // Convert to JPEG and send
      this.canvas.toBlob(
        (blob) => {
          if (!blob) return;

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(",")[1];
            if (this.client && this.client.connected) {
              this.client.sendImageMessage(base64, "image/jpeg");
            }
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        this.quality
      );
    };

    // Start interval
    this.captureInterval = setInterval(captureFrame, 1000 / this.fps);
  }

  /**
   * Stop capturing
   */
  stop() {
    this.isStreaming = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Take a single snapshot
   */
  takeSnapshot() {
    if (!this.video || !this.canvas) {
      throw new Error("Video not initialized");
    }

    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    return this.canvas.toDataURL("image/jpeg", this.quality);
  }

  /**
   * Get the video element for preview
   */
  getVideoElement() {
    return this.video;
  }
}

/**
 * Video Streamer - Captures and streams camera video
 */
export class VideoStreamer extends BaseVideoCapture {
  /**
   * Start video streaming from camera
   * @param {Object} options - { fps: number, width: number, height: number, facingMode: string, quality: number, deviceId: string }
   */
  async start(options = {}) {
    try {
      const {
        fps = 1,
        width = 640,
        height = 480,
        facingMode = "user", // 'user' for front camera, 'environment' for back
        quality = 0.8,
        deviceId = null,
      } = options;

      this.fps = fps;
      this.quality = quality;

      // Build video constraints
      const videoConstraints = {
        width: { ideal: width },
        height: { ideal: height },
      };

      // Add device ID if specified, otherwise use facingMode
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = facingMode;
      }

      // Get camera access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
      });

      // Initialize video and canvas elements
      this.initializeElements(width, height);

      // Wait for video to be ready
      await this.waitForVideoReady();

      // Start capturing frames
      this.isStreaming = true;
      this.startCapturing();

      console.log("📹 Camera streaming started at", fps, "fps");
      return this.video; // Return video element for preview
    } catch (error) {
      console.error("Failed to start camera streaming:", error);
      throw error;
    }
  }

  stop() {
    super.stop();
    console.log("🛑 Camera streaming stopped");
  }
}

/**
 * Screen Capture - Captures and streams screen/window
 */
export class ScreenCapture extends BaseVideoCapture {
  /**
   * Start screen capture
   * @param {Object} options - { fps: number, width: number, height: number, quality: number }
   */
  async start(options = {}) {
    try {
      const { fps = 1, width = 1280, height = 720, quality = 0.7 } = options;

      this.fps = fps;
      this.quality = quality;

      // Get screen capture permission
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });

      // Initialize video and canvas elements
      this.initializeElements(width, height);

      // Wait for video to be ready
      await this.waitForVideoReady();

      // Start capturing frames
      this.isStreaming = true;
      this.startCapturing();

      // Handle stream end (user stops sharing)
      this.mediaStream.getVideoTracks()[0].onended = () => {
        console.log("User stopped screen sharing");
        this.stop();
      };

      console.log("🖥️ Screen capture started at", fps, "fps");
      return this.video; // Return video element for preview
    } catch (error) {
      console.error("Failed to start screen capture:", error);
      throw error;
    }
  }

  stop() {
    super.stop();
    console.log("🛑 Screen capture stopped");
  }
}

/**
 * Audio Player - Plays audio responses from Gemini
 */
export class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.workletNode = null;
    this.gainNode = null;
    this.isInitialized = false;
    this.volume = 1.0;
    this.sampleRate = 24000; // Gemini outputs at 24kHz
  }

  /**
   * Initialize the audio player
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // Create audio context at 24kHz to match Gemini
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      // Load the audio worklet from external file
      await this.audioContext.audioWorklet.addModule(
        "/audio-processors/playback.worklet.js"
      );

      // Create worklet node
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "pcm-processor"
      );

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.volume;

      // Connect nodes
      this.workletNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      this.isInitialized = true;
      console.log("🔊 Audio player initialized");
    } catch (error) {
      console.error("Failed to initialize audio player:", error);
      throw error;
    }
  }

  /**
   * Play audio chunk from base64 PCM
   */
  async play(base64Audio) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      // Resume audio context if suspended
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Convert base64 to Float32Array
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 LE to Float32
      const inputArray = new Int16Array(bytes.buffer);
      const float32Data = new Float32Array(inputArray.length);
      for (let i = 0; i < inputArray.length; i++) {
        float32Data[i] = inputArray[i] / 32768;
      }

      // Send to worklet for playback
      this.workletNode.port.postMessage(float32Data);
    } catch (error) {
      console.error("Error playing audio chunk:", error);
      throw error;
    }
  }

  /**
   * Interrupt current playback
   */
  interrupt() {
    if (this.workletNode) {
      this.workletNode.port.postMessage("interrupt");
    }
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isInitialized = false;
  }
}


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/utils/tools.js

import { FunctionCallDefinition } from "./gemini-api";

/**
 * Show Alert Box Tool
 * Displays a browser alert dialog with a custom message
 */
export class ShowAlertTool extends FunctionCallDefinition {
  constructor() {
    super(
      "show_alert",
      "Displays an alert dialog box with a message to the user",
      {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message to display in the alert box",
          },
          title: {
            type: "string",
            description: "Optional title prefix for the alert message",
          },
        },
      },
      ["message"]
    );
  }

  functionToCall(parameters) {
    const message = parameters.message || "Alert!";
    const title = parameters.title;

    // Construct the full alert message
    const fullMessage = title ? `${title}: ${message}` : message;

    // Show the alert
    alert(fullMessage);

    console.log(` Alert shown: ${fullMessage}`);
  }
}

/**
 * Add CSS Style Tool
 * Injects CSS styles into the current page with !important flag
 */
export class AddCSSStyleTool extends FunctionCallDefinition {
  constructor() {
    super(
      "add_css_style",
      "Injects CSS styles into the current page with !important flag",
      {
        type: "object",
        properties: {
          selector: {
            type: "string",
            description:
              "CSS selector to target elements (e.g., 'body', '.class', '#id')",
          },
          property: {
            type: "string",
            description:
              "CSS property to set (e.g., 'background-color', 'font-size', 'display')",
          },
          value: {
            type: "string",
            description:
              "Value for the CSS property (e.g., 'red', '20px', 'none')",
          },
          styleId: {
            type: "string",
            description:
              "Optional ID for the style element (for updating existing styles)",
          },
        },
      },
      ["selector", "property", "value"]
    );
  }

  functionToCall(parameters) {
    const { selector, property, value, styleId } = parameters;

    // Create or find the style element
    let styleElement;
    if (styleId) {
      styleElement = document.getElementById(styleId);
      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }
    } else {
      styleElement = document.createElement("style");
      document.head.appendChild(styleElement);
    }

    // Create the CSS rule with !important
    const cssRule = `${selector} { ${property}: ${value} !important; }`;

    // Add the CSS rule to the style element
    if (styleId) {
      // If using an ID, replace the content
      styleElement.textContent = cssRule;
    } else {
      // Otherwise append to any existing content
      styleElement.textContent += cssRule;
    }

    console.log(`🎨 CSS style injected: ${cssRule}`);
    console.log(
      `   Applied to ${document.querySelectorAll(selector).length} element(s)`
    );
  }
}



gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/App.css

#root {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.react:hover {
  filter: drop-shadow(0 0 2em #61dafbaa);
}

@keyframes logo-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: no-preference) {
  a:nth-of-type(2) .logo {
    animation: logo-spin infinite 20s linear;
  }
}

.card {
  padding: 2em;
}

.read-the-docs {
  color: #888;
}

/* Main Content Styles */
.main-content {
  position: fixed;
  top: 60px;
  left: 0;
  width: 100%;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #f8f9fa;
  padding: 20px;
  text-align: center;
  box-sizing: border-box;
}

.onboarding-container {
  display: flex;
  gap: 20px;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 1000px;
  margin-top: 20px;
}

.onboarding-step {
  background-color: white;
  border: 1px solid #dadce0;
  border-radius: 8px;
  padding: 20px;
  width: 250px;
  text-align: left;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s;
}

.onboarding-step:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.onboarding-step h3 {
  margin-top: 0;
  color: #202124;
  font-size: 1.1rem;
}

.onboarding-step p {
  color: #5f6368;
  font-size: 0.9rem;
  line-height: 1.5;
  margin-bottom: 0;
}

.onboarding-step code {
  background-color: #f1f3f4;
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
}




gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/App.jsx


import LiveAPIDemo from "./components/LiveAPIDemo";
import "./App.css";

function App() {
  return (
    <div className="App">
      <LiveAPIDemo />
      <div className="main-content">
        <div className="onboarding-container">
          <div className="onboarding-step">
            <h3>Step 1: Configure</h3>
            <p>Start <code>server.py</code> locally, select your settings in the Configuration dropdown, and click the Connect button.</p>
          </div>
          <div className="onboarding-step">
            <h3>Step 2: Media</h3>
            <p>Enable your microphone and camera in the Media dropdown to stream input.</p>
          </div>
          <div className="onboarding-step">
            <h3>Step 3: Chat</h3>
            <p>Use the Chat dropdown to see transcriptions and send text messages.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/index.css


:root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}
a:hover {
  color: #535bf2;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}
button:hover {
  border-color: #646cff;
}
button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}

@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
  }
  a:hover {
    color: #747bff;
  }
  button {
    background-color: #f9f9f9;
  }
}


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/src/main.jsx

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)



gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/index.html

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Gemini Live API React Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/eslint.config.js

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/package.json

{
  "name": "base-react-2",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^5.1.0",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "vite": "^7.2.2"
  }
}


gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/requirements.txt

websockets>=12.0
google-auth>=2.23.0
certifi>=2023.7.22

gemini/multimodal-live-api/native-audio-websocket-demo-apps/react-demo-app/server.py

#!/usr/bin/env python3
"""
WebSocket Proxy Server for Gemini Live API
Handles authentication and proxies WebSocket connections.

This server acts as a bridge between the browser client and Gemini API,
handling Google Cloud authentication automatically using default credentials.
"""

import asyncio
import websockets
import json
import ssl
import certifi
import os
from websockets.legacy.server import WebSocketServerProtocol
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.exceptions import ConnectionClosed

# Google auth imports
import google.auth
from google.auth.transport.requests import Request

DEBUG = False  # Set to True for verbose logging
WS_PORT = 8080    # Port for WebSocket server


def generate_access_token():
    """Retrieves an access token using Google Cloud default credentials."""
    try:
        creds, _ = google.auth.default()
        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    except Exception as e:
        print(f"Error generating access token: {e}")
        print("Make sure you're logged in with: gcloud auth application-default login")
        return None


async def proxy_task(
    source_websocket: WebSocketCommonProtocol,
    destination_websocket: WebSocketCommonProtocol,
    is_server: bool,
) -> None:
    """
    Forwards messages from source_websocket to destination_websocket.

    Args:
        source_websocket: The WebSocket connection to receive messages from.
        destination_websocket: The WebSocket connection to send messages to.
        is_server: True if source is server side, False otherwise.
    """
    try:
        async for message in source_websocket:
            try:
                data = json.loads(message)
                if DEBUG:
                    print(f"Proxying from {'server' if is_server else 'client'}: {data}")
                await destination_websocket.send(json.dumps(data))
            except Exception as e:
                print(f"Error processing message: {e}")
    except ConnectionClosed as e:
        print(
            f"{'Server' if is_server else 'Client'} connection closed: {e.code} - {e.reason}"
        )
    except Exception as e:
        print(f"Unexpected error in proxy_task: {e}")
    finally:
        await destination_websocket.close()


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str, service_url: str
) -> None:
    """
    Establishes a WebSocket connection to the Gemini server and creates bidirectional proxy.

    Args:
        client_websocket: The WebSocket connection of the client.
        bearer_token: The bearer token for authentication with the server.
        service_url: The url of the service to connect to.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    # Create SSL context with certifi certificates
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    print(f"Connecting to Gemini API...")
    if DEBUG:
        print(f"Service URL: {service_url}")

    try:
        async with websockets.connect(
            service_url,
            additional_headers=headers,
            ssl=ssl_context
        ) as server_websocket:
            print(f"✅ Connected to Gemini API")

            # Create bidirectional proxy tasks
            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket, is_server=False)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket, is_server=True)
            )

            # Wait for either task to complete
            done, pending = await asyncio.wait(
                [client_to_server_task, server_to_client_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            # Cancel the remaining task
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            # Close connections
            try:
                await server_websocket.close()
            except:
                pass

            try:
                await client_websocket.close()
            except:
                pass

    except ConnectionClosed as e:
        print(f"Server connection closed unexpectedly: {e.code} - {e.reason}")
        if not client_websocket.closed:
            await client_websocket.close(code=e.code, reason=e.reason)
    except Exception as e:
        print(f"Failed to connect to Gemini API: {e}")
        if not client_websocket.closed:
            await client_websocket.close(code=1008, reason="Upstream connection failed")


async def handle_websocket_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new WebSocket client connection.

    Expects first message with optional bearer_token and service_url.
    If no bearer_token provided, generates one using Google default credentials.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    print("🔌 New WebSocket client connection...")
    try:
        # Wait for the first message from the client
        service_setup_message = await asyncio.wait_for(
            client_websocket.recv(), timeout=10.0
        )
        service_setup_message_data = json.loads(service_setup_message)

        bearer_token = service_setup_message_data.get("bearer_token")
        service_url = service_setup_message_data.get("service_url")

        # If no bearer token provided, generate one using default credentials
        if not bearer_token:
            print("🔑 Generating access token using default credentials...")
            bearer_token = generate_access_token()
            if not bearer_token:
                print("❌ Failed to generate access token")
                await client_websocket.close(
                    code=1008, reason="Authentication failed"
                )
                return
            print("✅ Access token generated")

        if not service_url:
            print("❌ Error: Service URL is missing")
            await client_websocket.close(
                code=1008, reason="Service URL is required"
            )
            return

        await create_proxy(client_websocket, bearer_token, service_url)

    except asyncio.TimeoutError:
        print("⏱️ Timeout waiting for the first message from the client")
        await client_websocket.close(code=1008, reason="Timeout")
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in first message: {e}")
        await client_websocket.close(code=1008, reason="Invalid JSON")
    except Exception as e:
        print(f"❌ Error handling client: {e}")
        if not client_websocket.closed:
            await client_websocket.close(code=1011, reason="Internal error")


async def start_websocket_server():
    """Start the WebSocket proxy server."""
    async with websockets.serve(handle_websocket_client, "0.0.0.0", WS_PORT):
        print(f"🔌 WebSocket proxy running on ws://localhost:{WS_PORT}")
        # Run forever
        await asyncio.Future()


async def main():
    """
    Starts the WebSocket server.
    """
    print(f"""
╔════════════════════════════════════════════════════════════╗
║     Gemini Live API Proxy Server                          ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  🔌 WebSocket Proxy: ws://localhost:{WS_PORT:<5}                   ║
║                                                            ║
║  Authentication:                                           ║
║  • Uses Google Cloud default credentials                  ║
║  • Run: gcloud auth application-default login             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
""")

    await start_websocket_server()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Servers stopped")