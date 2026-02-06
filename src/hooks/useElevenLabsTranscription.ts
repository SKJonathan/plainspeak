import { useState, useRef, useCallback } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
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

export function useElevenLabsTranscription({ audioSource = "microphone" }: UseElevenLabsTranscriptionOptions = {}): UseElevenLabsTranscriptionReturn {
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const transcriptBufferRef = useRef<TranscriptEntry[]>([]);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Clean old entries from buffer
  const cleanBuffer = useCallback(() => {
    const cutoff = Date.now() - BUFFER_DURATION_MS;
    transcriptBufferRef.current = transcriptBufferRef.current.filter(
      (entry) => entry.timestamp > cutoff
    );
  }, []);

  // Get transcript from the last N seconds
  const getBufferedTranscript = useCallback((seconds: number = 60) => {
    const cutoff = Date.now() - seconds * 1000;
    const relevantEntries = transcriptBufferRef.current.filter(
      (entry) => entry.timestamp > cutoff
    );
    return relevantEntries.map((e) => e.text).join(" ").trim();
  }, []);

  const clearTranscript = useCallback(() => {
    transcriptBufferRef.current = [];
    setTranscript("");
    setInterimTranscript("");
  }, []);

  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    onPartialTranscript: (data) => {
      setInterimTranscript(data.text);
    },
    onCommittedTranscript: (data) => {
      if (data.text.trim()) {
        cleanBuffer();
        transcriptBufferRef.current.push({
          text: data.text.trim(),
          timestamp: Date.now(),
        });
        setTranscript((prev) => (prev + " " + data.text).trim());
        setInterimTranscript("");
      }
    },
  });

  const cleanupStreams = useCallback(() => {
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      let micStream: MediaStream | null = null;
      let displayStream: MediaStream | null = null;

      if (audioSource === "microphone" || audioSource === "both") {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (audioSource === "computer" || audioSource === "both") {
        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true,
          });
          displayStreamRef.current = displayStream;
          displayStream.getVideoTracks().forEach((t) => t.stop());
          displayStream.getAudioTracks().forEach((track) => {
            track.onended = () => {
              scribe.disconnect();
              cleanupStreams();
            };
          });
        } catch (displayErr) {
          console.warn("System audio not available, falling back to mic:", displayErr);
          if (!micStream) {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          }
        }
      }

      let finalStream: MediaStream | undefined;
      if (micStream && displayStream?.getAudioTracks().length) {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const dest = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(micStream).connect(dest);
        ctx.createMediaStreamSource(displayStream).connect(dest);
        finalStream = dest.stream;
      } else if (displayStream?.getAudioTracks().length) {
        finalStream = displayStream;
      } else if (micStream) {
        finalStream = micStream;
      } else {
        throw new Error("No audio source available");
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        "elevenlabs-scribe-token"
      );

      if (fnError) {
        throw new Error(fnError.message || "Failed to get transcription token");
      }

      if (!data?.token) {
        throw new Error("No token received from server");
      }

      await scribe.connect({
        token: data.token,
        ...(finalStream
          ? { stream: finalStream }
          : {
              microphone: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            }),
      });
    } catch (err) {
      console.error("Failed to start transcription:", err);
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setError("Microphone access denied. Please allow microphone access.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Failed to start transcription");
      }
    } finally {
      setIsConnecting(false);
    }
  }, [scribe, audioSource, cleanupStreams]);

  const stopListening = useCallback(() => {
    scribe.disconnect();
    cleanupStreams();
  }, [scribe, cleanupStreams]);

  return {
    isListening: scribe.isConnected,
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
