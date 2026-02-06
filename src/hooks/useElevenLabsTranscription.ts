import { useState, useRef, useCallback } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { WebSocketTranscription } from "./WebSocketTranscription";
import { supabase } from "@/integrations/supabase/client";

type AudioSource = "microphone" | "computer" | "both";

interface TranscriptEntry {
  text: string;
  timestamp: number;
}

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

const BUFFER_DURATION_MS = 60000;

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
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const transcriptBufferRef = useRef<TranscriptEntry[]>([]);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const mixContextRef = useRef<AudioContext | null>(null);
  const wsTranscriptionRef = useRef<WebSocketTranscription | null>(null);

  const needsSystemAudio = audioSource === "computer" || audioSource === "both";
  const canUseSystemAudio = supportsSystemAudio();
  const useWsMode = needsSystemAudio && canUseSystemAudio;

  // ─── Buffer helpers ───
  const cleanBuffer = useCallback(() => {
    const cutoff = Date.now() - BUFFER_DURATION_MS;
    transcriptBufferRef.current = transcriptBufferRef.current.filter(
      (e) => e.timestamp > cutoff
    );
  }, []);

  // ─── Scribe callbacks (stable refs) ───
  const cleanBufferRef = useRef(cleanBuffer);
  cleanBufferRef.current = cleanBuffer;

  const handlePartial = useCallback((data: { text: string }) => {
    setInterimTranscript(data.text);
  }, []);

  const handleCommitted = useCallback((data: { text: string }) => {
    if (data.text.trim()) {
      cleanBufferRef.current();
      transcriptBufferRef.current.push({
        text: data.text.trim(),
        timestamp: Date.now(),
      });
      setTranscript((prev) => (prev + " " + data.text).trim());
      setInterimTranscript("");
    }
  }, []);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: handlePartial,
    onCommittedTranscript: handleCommitted,
  });

  // ─── Stream cleanup ───
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

  // ─── Get or create WS transcription instance ───
  const getWsTranscription = useCallback(() => {
    if (!wsTranscriptionRef.current) {
      wsTranscriptionRef.current = new WebSocketTranscription({
        onConnected: () => {
          setWsConnected(true);
          setIsConnecting(false);
        },
        onDisconnected: () => {
          setWsConnected(false);
        },
        onPartialTranscript: (text) => {
          setInterimTranscript(text);
        },
        onCommittedTranscript: (text) => {
          setTranscript((prev) => (prev + " " + text).trim());
          setInterimTranscript("");
        },
        onError: (err) => {
          setError(err);
          setWsConnected(false);
          setIsConnecting(false);
        },
      });
    }
    return wsTranscriptionRef.current;
  }, []);

  // ─── Start listening ───
  const startListening = useCallback(async () => {
    setError(null);
    setIsConnecting(true);

    if (useWsMode) {
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
          displayStream.getVideoTracks().forEach((t) => t.stop());
          const wsTx = getWsTranscription();
          displayStream.getAudioTracks().forEach((track) => {
            track.onended = () => {
              wsTx.disconnect();
              cleanupStreams();
              setWsConnected(false);
            };
          });
        } catch (displayErr) {
          console.warn("System audio capture failed:", displayErr);
          if (audioSource === "computer") {
            setError("System audio capture was denied or is not available.");
            setIsConnecting(false);
            return;
          }
        }

        let finalStream: MediaStream;
        if (micStream && displayStream?.getAudioTracks().length) {
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
          setIsConnecting(false);
          return;
        }

        await getWsTranscription().connect(finalStream);
      } catch (err) {
        console.error("Failed to start WS transcription:", err);
        if (err instanceof Error && err.name === "NotAllowedError") {
          setError("Microphone access denied. Please allow microphone access.");
        } else {
          setError(err instanceof Error ? err.message : "Failed to start transcription");
        }
        setIsConnecting(false);
      }
    } else {
      // Scribe SDK mode (mic only)
      if (needsSystemAudio && !canUseSystemAudio) {
        setError("Computer audio capture is only supported on desktop Chrome/Edge. Falling back to microphone.");
      }

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
        setIsConnecting(false);
      }
    }
  }, [useWsMode, audioSource, needsSystemAudio, canUseSystemAudio, scribe, getWsTranscription, cleanupStreams]);

  // ─── Stop listening ───
  const stopListening = useCallback(() => {
    if (wsTranscriptionRef.current) {
      wsTranscriptionRef.current.disconnect();
      setWsConnected(false);
    }
    scribe.disconnect();
    cleanupStreams();
  }, [scribe, cleanupStreams]);

  // ─── Buffered transcript ───
  const getBufferedTranscript = useCallback((seconds: number = 60) => {
    if (useWsMode && wsTranscriptionRef.current) {
      return wsTranscriptionRef.current.getBufferedTranscript(seconds);
    }
    const cutoff = Date.now() - seconds * 1000;
    return transcriptBufferRef.current
      .filter((e) => e.timestamp > cutoff)
      .map((e) => e.text)
      .join(" ")
      .trim();
  }, [useWsMode]);

  // ─── Clear transcript ───
  const clearTranscript = useCallback(() => {
    if (wsTranscriptionRef.current) {
      wsTranscriptionRef.current.clearBuffer();
    }
    transcriptBufferRef.current = [];
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isListening: useWsMode ? wsConnected : scribe.isConnected,
    isConnecting,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    getBufferedTranscript,
    clearTranscript,
    error,
  };
}
