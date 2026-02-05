import { useState, useRef, useCallback, useEffect } from "react";

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

// Type definitions for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface TranscriptEntry {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  getBufferedTranscript: (seconds?: number) => string;
  clearTranscript: () => void;
  error: string | null;
}

const BUFFER_DURATION_MS = 60000; // 60 seconds rolling buffer

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const transcriptBufferRef = useRef<TranscriptEntry[]>([]);
  const shouldRestartRef = useRef(false);

  const isSupported = typeof window !== "undefined" && 
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

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
      (entry) => entry.timestamp > cutoff && entry.isFinal
    );
    return relevantEntries.map((e) => e.text).join(" ").trim();
  }, []);

  const clearTranscript = useCallback(() => {
    transcriptBufferRef.current = [];
    setTranscript("");
    setInterimTranscript("");
  }, []);

  const initRecognition = useCallback(() => {
    if (!isSupported) return null;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return null;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalText += text + " ";
          transcriptBufferRef.current.push({
            text: text.trim(),
            timestamp: Date.now(),
            isFinal: true,
          });
        } else {
          interimText += text;
        }
      }

      if (finalText) {
        cleanBuffer();
        setTranscript((prev) => (prev + " " + finalText).trim());
      }
      setInterimTranscript(interimText);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      
      // Don't treat "no-speech" as a fatal error
      if (event.error === "no-speech") {
        return;
      }
      
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow microphone access.");
        shouldRestartRef.current = false;
      } else if (event.error === "network") {
        setError("Network error. Speech recognition requires internet.");
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      
      // Auto-restart if we should be listening
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.error("Failed to restart recognition:", e);
        }
      }
    };

    return recognition;
  }, [isSupported, cleanBuffer]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    shouldRestartRef.current = true;
    
    if (!recognitionRef.current) {
      recognitionRef.current = initRecognition();
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Already started
        console.log("Recognition already started");
      }
    }
  }, [isSupported, initRecognition]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    getBufferedTranscript,
    clearTranscript,
    error,
  };
}
