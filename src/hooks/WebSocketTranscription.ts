import { supabase } from "@/integrations/supabase/client";

interface TranscriptEntry {
  text: string;
  timestamp: number;
}

export interface WebSocketTranscriptionCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onPartialTranscript: (text: string) => void;
  onCommittedTranscript: (text: string) => void;
  onError: (error: string) => void;
}

const BUFFER_DURATION_MS = 60000;

/**
 * Imperative WebSocket-based ElevenLabs Scribe transcription.
 * Not a React hook — managed via ref to avoid hook ordering issues with useScribe.
 */
export class WebSocketTranscription {
  private ws: WebSocket | null = null;
  private processor: ScriptProcessorNode | null = null;
  private audioContext: AudioContext | null = null;
  private buffer: TranscriptEntry[] = [];
  private callbacks: WebSocketTranscriptionCallbacks;

  isConnected = false;

  constructor(callbacks: WebSocketTranscriptionCallbacks) {
    this.callbacks = callbacks;
  }

  private cleanBuffer() {
    const cutoff = Date.now() - BUFFER_DURATION_MS;
    this.buffer = this.buffer.filter((e) => e.timestamp > cutoff);
  }

  getBufferedTranscript(seconds: number = 60): string {
    const cutoff = Date.now() - seconds * 1000;
    return this.buffer
      .filter((e) => e.timestamp > cutoff)
      .map((e) => e.text)
      .join(" ")
      .trim();
  }

  clearBuffer() {
    this.buffer = [];
  }

  async connect(stream: MediaStream) {
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "elevenlabs-scribe-token"
      );
      if (fnError) throw new Error(fnError.message || "Failed to get token");
      if (!data?.token) throw new Error("No token received");

      // Pass all config as query params, including commit_strategy=vad
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&sample_rate=16000&audio_format=pcm_16000&language_code=en&commit_strategy=vad&token=${encodeURIComponent(data.token)}`
      );
      this.ws = ws;

      ws.onopen = () => {
        console.log("WS connected to ElevenLabs STT");
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log("WS STT message received:", msg.message_type, msg);
          
          if (msg.message_type === "session_started") {
            this.isConnected = true;
            this.callbacks.onConnected();
            this.startAudioCapture(stream);
          } else if (msg.message_type === "partial_transcript") {
            this.callbacks.onPartialTranscript(msg.text || "");
          } else if (msg.message_type === "committed_transcript") {
            const text = msg.text?.trim();
            if (text) {
              this.cleanBuffer();
              this.buffer.push({ text, timestamp: Date.now() });
              this.callbacks.onCommittedTranscript(text);
            }
          } else if (msg.message_type?.includes("error")) {
            console.error("ElevenLabs STT error:", msg);
            this.callbacks.onError(msg.error || msg.message || "Transcription error");
          }
        } catch (e) {
          console.warn("Failed to parse WS message:", e);
        }
      };

      ws.onerror = () => {
        this.callbacks.onError("Transcription connection error");
        this.disconnect();
      };

      ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onDisconnected();
      };
    } catch (err) {
      throw err;
    }
  }

  disconnect() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private startAudioCapture(stream: MediaStream) {
    // Use the stream's native sample rate, then resample to 16kHz for the API
    const nativeSampleRate = stream.getAudioTracks()[0]?.getSettings()?.sampleRate || 48000;
    const targetSampleRate = 16000;

    const audioContext = new AudioContext({ sampleRate: nativeSampleRate });
    this.audioContext = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    this.processor = processor;

    const resampleRatio = nativeSampleRate / targetSampleRate;

    processor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);

      // Downsample to 16kHz
      const outputLength = Math.floor(inputData.length / resampleRatio);
      const pcm16 = new Int16Array(outputLength);
      for (let i = 0; i < outputLength; i++) {
        const srcIndex = Math.floor(i * resampleRatio);
        const s = Math.max(-1, Math.min(1, inputData[srcIndex]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      // Send as input_audio_chunk per ElevenLabs Scribe WebSocket API
      this.ws.send(JSON.stringify({
        message_type: "input_audio_chunk",
        audio_base_64: btoa(binary),
      }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  }
}
