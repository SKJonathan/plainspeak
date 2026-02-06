import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TranscriptEntry {
  text: string;
  timestamp: number;
}

interface UseWebSocketTranscriptionReturn {
  isConnected: boolean;
  isConnecting: boolean;
  transcript: string;
  interimTranscript: string;
  connect: (stream: MediaStream) => Promise<void>;
  disconnect: () => void;
  getBufferedTranscript: (seconds?: number) => string;
  clearTranscript: () => void;
  error: string | null;
}

const BUFFER_DURATION_MS = 60000;

/**
 * Raw WebSocket-based ElevenLabs Scribe transcription.
 * Accepts any MediaStream (mic, system audio, or mixed).
 */
export function useWebSocketTranscription(): UseWebSocketTranscriptionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptBufferRef = useRef<TranscriptEntry[]>([]);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanBuffer = useCallback(() => {
    const cutoff = Date.now() - BUFFER_DURATION_MS;
    transcriptBufferRef.current = transcriptBufferRef.current.filter(
      (entry) => entry.timestamp > cutoff
    );
  }, []);

  const getBufferedTranscript = useCallback((seconds: number = 60) => {
    const cutoff = Date.now() - seconds * 1000;
    return transcriptBufferRef.current
      .filter((e) => e.timestamp > cutoff)
      .map((e) => e.text)
      .join(" ")
      .trim();
  }, []);

  const clearTranscript = useCallback(() => {
    transcriptBufferRef.current = [];
    setTranscript("");
    setInterimTranscript("");
  }, []);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    // Don't stop the stream here - the caller owns it
    streamRef.current = null;
    setIsConnected(false);
  }, []);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const connect = useCallback(async (stream: MediaStream) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Get token from edge function
      const { data, error: fnError } = await supabase.functions.invoke(
        "elevenlabs-scribe-token"
      );
      if (fnError) throw new Error(fnError.message || "Failed to get token");
      if (!data?.token) throw new Error("No token received");

      const token = data.token;
      streamRef.current = stream;

      // Connect WebSocket
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/speech-to-text/realtime?token=${encodeURIComponent(token)}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        // Send initial config
        ws.send(JSON.stringify({
          type: "config",
          model_id: "scribe_v2_realtime",
          sample_rate: 16000,
          audio_format: "pcm_16000",
          commit_strategy: "vad",
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.message_type === "session_started") {
            setIsConnected(true);
            setIsConnecting(false);
            startAudioCapture(stream, ws);
          } else if (msg.message_type === "partial_transcript") {
            setInterimTranscript(msg.text || "");
          } else if (msg.message_type === "committed_transcript") {
            const text = msg.text?.trim();
            if (text) {
              cleanBuffer();
              transcriptBufferRef.current.push({
                text,
                timestamp: Date.now(),
              });
              setTranscript((prev) => (prev + " " + text).trim());
              setInterimTranscript("");
            }
          }
        } catch (e) {
          console.warn("Failed to parse WS message:", e);
        }
      };

      ws.onerror = (e) => {
        console.error("WebSocket error:", e);
        setError("Transcription connection error");
        cleanup();
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        cleanup();
      };
    } catch (err) {
      console.error("Failed to start WebSocket transcription:", err);
      setError(err instanceof Error ? err.message : "Failed to start transcription");
      setIsConnecting(false);
    }
  }, [cleanBuffer, cleanup]);

  const startAudioCapture = (stream: MediaStream, ws: WebSocket) => {
    const audioContext = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    // ScriptProcessorNode is deprecated but widely supported and works with any stream
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Convert to base64
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      ws.send(JSON.stringify({
        audio_base_64: base64,
      }));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
  };

  return {
    isConnected,
    isConnecting,
    transcript,
    interimTranscript,
    connect,
    disconnect,
    getBufferedTranscript,
    clearTranscript,
    error,
  };
}
