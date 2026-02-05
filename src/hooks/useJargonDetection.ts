import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseJargonDetectionOptions {
  transcript: string;
  isListening: boolean;
  detectionIntervalMs?: number;
}

interface UseJargonDetectionReturn {
  detectedJargon: Set<string>;
  isDetecting: boolean;
  explanationCache: Map<string, string>;
  explainWord: (word: string, context?: string) => Promise<{ isJargon: boolean; explanation: string | null }>;
  isExplaining: boolean;
}

export function useJargonDetection({
  transcript,
  isListening,
  detectionIntervalMs = 5000,
}: UseJargonDetectionOptions): UseJargonDetectionReturn {
  const [detectedJargon, setDetectedJargon] = useState<Set<string>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const explanationCache = useRef<Map<string, string>>(new Map());
  const lastAnalyzedTranscript = useRef<string>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const detectJargon = useCallback(async (text: string) => {
    if (!text.trim() || text === lastAnalyzedTranscript.current) return;

    setIsDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("detect-jargon-batch", {
        body: { transcript: text },
      });

      if (error) {
        console.error("Jargon detection error:", error);
        return;
      }

      if (data?.jargonWords && Array.isArray(data.jargonWords)) {
        setDetectedJargon((prev) => {
          const newSet = new Set(prev);
          data.jargonWords.forEach((word: string) => {
            newSet.add(word.toLowerCase());
          });
          return newSet;
        });
        lastAnalyzedTranscript.current = text;
      }
    } catch (err) {
      console.error("Failed to detect jargon:", err);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  // Periodic jargon detection while listening
  useEffect(() => {
    if (isListening && transcript) {
      // Clear existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      // Run detection immediately on new transcript
      detectJargon(transcript);

      // Set up periodic detection
      intervalRef.current = setInterval(() => {
        if (transcript !== lastAnalyzedTranscript.current) {
          detectJargon(transcript);
        }
      }, detectionIntervalMs);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [isListening, transcript, detectJargon, detectionIntervalMs]);

  const explainWord = useCallback(
    async (word: string, context?: string): Promise<{ isJargon: boolean; explanation: string | null }> => {
      const cacheKey = word.toLowerCase();
      
      // Check cache first
      if (explanationCache.current.has(cacheKey)) {
        return { isJargon: true, explanation: explanationCache.current.get(cacheKey)! };
      }

      setIsExplaining(true);
      try {
        const { data, error } = await supabase.functions.invoke("explain-word", {
          body: { word, context },
        });

        if (error) {
          console.error("Explain word error:", error);
          return { isJargon: false, explanation: null };
        }

        if (data?.explanation) {
          explanationCache.current.set(cacheKey, data.explanation);
        }

        return {
          isJargon: data?.isJargon ?? false,
          explanation: data?.explanation ?? null,
        };
      } catch (err) {
        console.error("Failed to explain word:", err);
        return { isJargon: false, explanation: null };
      } finally {
        setIsExplaining(false);
      }
    },
    []
  );

  return {
    detectedJargon,
    isDetecting,
    explanationCache: explanationCache.current,
    explainWord,
    isExplaining,
  };
}
