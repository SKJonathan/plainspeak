import { useState, useRef, useCallback, useEffect } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { useWebSocketTranscription } from "./useWebSocketTranscription";
import { supabase } from "@/integrations/supabase/client";

type AudioSource = "microphone" | "computer" | "both";

interface UseElevenLabsTranscriptionOptions {
  audioSource?: AudioSource;
}

interface UseElevenLabsTranscriptionReturn {
  isListening: boolean;
  isConnecting: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => Promise<void>;
  stopListening: () => void;
  getBufferedTranscript: (seconds?: number) => string;
  clearTranscript: () => void;
  error: string | null;
}

interface TranscriptEntry {
  text: string;
  timestamp: number;
}

const BUFFER_DURATION_MS = 60000;

/**
 * Returns true if the browser supports getDisplayMedia with audio
 * (desktop Chrome/Edge only).
 */
function supportsSystemAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    /Chrome|Edg/i.test(navigator.userAgent) &&
    !/Android|Mobile/i.test(navigator.userAgent)
  );
}

export function useElevenLabsTranscription({
  audioSource = "microphone",
}: UseElevenLabsTranscriptionOptions = {}): UseElevenLabsTranscriptionReturn {
  // Determine effective mode: use WebSocket for computer/both if browser supports it
  const needsSystemAudio = audioSource === "computer" || audioSource === "both";
  const canUseSystemAudio = supportsSystemAudio();
  const useWsMode = needsSystemAudio && canUseSystemAudio;

  // ─── Shared state ───
  const [error, setError] = useState<string | null>(null);

  // ─── Scribe-based (mic-only) ───
  const [scribeConnecting, setScribeConnecting] = useState(false);
  const [scribeTranscript, setScribeTranscript] = useState("");
  const [scribeInterim, setScribeInterim] = useState("");
  const scribeBufferRef = useRef<TranscriptEntry[]>([]);

  const cleanScribeBuffer = useCallback(() => {
    const cutoff = Date.now() - BUFFER_DURATION_MS;
    scribeBufferRef.current = scribeBufferRef.current.filter(
      (e) => e.timestamp > cutoff
    );
  }, []);

  const handlePartial = useCallback((data: { text: string }) => {
    setScribeInterim(data.text);
  }, []);

  const handleCommitted = useCallback((data: { text: string }) => {
    if (data.text.trim()) {
      cleanScribeBuffer();
      scribeBufferRef.current.push({
        text: data.text.trim(),
        timestamp: Date.now(),
      });
      setScribeTranscript((prev) => (prev + " " + data.text).trim());
      setScribeInterim("");
    }
  }, [cleanScribeBuffer]);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: handlePartial,
    onCommittedTranscript: handleCommitted,
  });

  // ─── WebSocket-based (computer/both audio) ───
  const ws = useWebSocketTranscription();
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixContextRef = useRef<AudioContext | null>(null);

  // Clean up display streams
  const cleanupStreams = useCallback(() => {
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (mixContextRef.current) {
      mixContextRef.current.close();
      mixContextRef.current = null;
    }
  }, []);

  // ─── Start listening ───
  const startListening = useCallback(async () => {
    setError(null);

    if (useWsMode) {
      // WebSocket mode: build the appropriate stream and connect
      try {
        let micStream: MediaStream | null = null;
        let displayStream: MediaStream | null = null;

        if (audioSource === "both") {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true,
          });
          displayStreamRef.current = displayStream;
          // Stop video tracks - we only need audio
          displayStream.getVideoTracks().forEach((t) => t.stop());
          // Auto-disconnect when user stops sharing
          displayStream.getAudioTracks().forEach((track) => {
            track.onended = () => {
              ws.disconnect();
              cleanupStreams();
            };
          });
        } catch (displayErr) {
          console.warn("System audio capture failed:", displayErr);
          if (audioSource === "computer") {
            setError("System audio capture was denied or is not available. Please try Microphone mode.");
            return;
          }
          // For "both", fall back to mic only
        }

        let finalStream: MediaStream;
        if (micStream && displayStream?.getAudioTracks().length) {
          // Mix mic + system audio
          const ctx = new AudioContext();
          mixContextRef.current = ctx;
          const dest = ctx.createMediaStreamDestination();
          ctx.createMediaStreamSource(micStream).connect(dest);
          ctx.createMediaStreamSource(displayStream).connect(dest);
          finalStream = dest.stream;
        } else if (displayStream?.getAudioTracks().length) {
          finalStream = displayStream;
        } else if (micStream) {
          finalStream = micStream;
        } else {
          setError("No audio source available");
          return;
        }

        await ws.connect(finalStream);
      } catch (err) {
        console.error("Failed to start WS transcription:", err);
        if (err instanceof Error && err.name === "NotAllowedError") {
          setError("Microphone access denied. Please allow microphone access.");
        } else {
          setError(err instanceof Error ? err.message : "Failed to start transcription");
        }
      }
    } else {
      // Scribe SDK mode (mic only)
      if (needsSystemAudio && !canUseSystemAudio) {
        setError("Computer audio capture is only supported on desktop Chrome/Edge. Falling back to microphone.");
      }

      setScribeConnecting(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "elevenlabs-scribe-token"
        );
        if (fnError) throw new Error(fnError.message || "Failed to get token");
        if (!data?.token) throw new Error("No token received");

        await scribe.connect({
          token: data.token,
          microphone: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        console.error("Failed to start transcription:", err);
        if (err instanceof Error && err.name === "NotAllowedError") {
          setError("Microphone access denied. Please allow microphone access.");
        } else {
          setError(err instanceof Error ? err.message : "Failed to start transcription");
        }
      } finally {
        setScribeConnecting(false);
      }
    }
  }, [useWsMode, audioSource, needsSystemAudio, canUseSystemAudio, scribe, ws, cleanupStreams]);

  // ─── Stop listening ───
  const stopListening = useCallback(() => {
    if (useWsMode) {
      ws.disconnect();
      cleanupStreams();
    } else {
      scribe.disconnect();
    }
  }, [useWsMode, ws, scribe, cleanupStreams]);

  // ─── Buffered transcript ───
  const getBufferedTranscript = useCallback((seconds: number = 60) => {
    if (useWsMode) {
      return ws.getBufferedTranscript(seconds);
    }
    const cutoff = Date.now() - seconds * 1000;
    return scribeBufferRef.current
      .filter((e) => e.timestamp > cutoff)
      .map((e) => e.text)
      .join(" ")
      .trim();
  }, [useWsMode, ws]);

  // ─── Clear transcript ───
  const clearTranscript = useCallback(() => {
    if (useWsMode) {
      ws.clearTranscript();
    } else {
      scribeBufferRef.current = [];
      setScribeTranscript("");
      setScribeInterim("");
    }
  }, [useWsMode, ws]);

  // ─── Return unified interface ───
  const isListening = useWsMode ? ws.isConnected : scribe.isConnected;
  const isConnecting = useWsMode ? ws.isConnecting : scribeConnecting;
  const transcript = useWsMode ? ws.transcript : scribeTranscript;
  const interimTranscript = useWsMode ? ws.interimTranscript : scribeInterim;
  const combinedError = error || (useWsMode ? ws.error : null);

  return {
    isListening,
    isConnecting,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    getBufferedTranscript,
    clearTranscript,
    error: combinedError,
  };
}
