import { useState, useRef, useCallback } from "react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { supabase } from "@/integrations/supabase/client";

interface TranscriptEntry {
  text: string;
  timestamp: number;
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

const BUFFER_DURATION_MS = 60000; // 60 seconds rolling buffer

export function useElevenLabsTranscription(): UseElevenLabsTranscriptionReturn {
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const transcriptBufferRef = useRef<TranscriptEntry[]>([]);

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

  const startListening = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get token from edge function
      const { data, error: fnError } = await supabase.functions.invoke(
        "elevenlabs-scribe-token"
      );

      if (fnError) {
        throw new Error(fnError.message || "Failed to get transcription token");
      }

      if (!data?.token) {
        throw new Error("No token received from server");
      }

      // Start the transcription session
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
  }, [scribe]);

  const stopListening = useCallback(() => {
    scribe.disconnect();
  }, [scribe]);

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
