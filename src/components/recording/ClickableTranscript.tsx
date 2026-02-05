import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { WordExplanationDialog } from "./WordExplanationDialog";

interface ClickableTranscriptProps {
  transcript: string;
  interimTranscript: string;
  detectedJargon: Set<string>;
  explanationCache: Map<string, string>;
  onExplainWord: (word: string, context?: string) => Promise<{ isJargon: boolean; explanation: string | null }>;
  isExplaining: boolean;
}

export function ClickableTranscript({
  transcript,
  interimTranscript,
  detectedJargon,
  explanationCache,
  onExplainWord,
  isExplaining,
}: ClickableTranscriptProps) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isJargon, setIsJargon] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const isWordJargon = useCallback(
    (word: string): boolean => {
      const cleanWord = word.toLowerCase().replace(/[.,!?;:'"]/g, "");
      return detectedJargon.has(cleanWord);
    },
    [detectedJargon]
  );

  const handleWordClick = useCallback(
    async (word: string) => {
      const cleanWord = word.replace(/[.,!?;:'"]/g, "").trim();
      if (!cleanWord) return;

      setSelectedWord(cleanWord);
      setDialogOpen(true);

      // Check cache first
      const cachedExplanation = explanationCache.get(cleanWord.toLowerCase());
      if (cachedExplanation) {
        setExplanation(cachedExplanation);
        setIsJargon(true);
        setLoadingExplanation(false);
        return;
      }

      // Fetch explanation
      setLoadingExplanation(true);
      setExplanation(null);
      
      const result = await onExplainWord(cleanWord, transcript);
      setExplanation(result.explanation);
      setIsJargon(result.isJargon);
      setLoadingExplanation(false);
    },
    [explanationCache, onExplainWord, transcript]
  );

  const renderWord = (word: string, index: number, isInterim: boolean = false) => {
    const isHighlighted = !isInterim && isWordJargon(word);
    
    return (
      <span
        key={`${index}-${word}`}
        onClick={() => !isInterim && handleWordClick(word)}
        className={cn(
          "cursor-pointer transition-colors rounded px-0.5 -mx-0.5",
          isInterim
            ? "text-muted-foreground"
            : isHighlighted
            ? "bg-primary/20 text-primary font-medium hover:bg-primary/30"
            : "hover:bg-muted"
        )}
      >
        {word}{" "}
      </span>
    );
  };

  const transcriptWords = transcript.split(/\s+/).filter(Boolean);
  const interimWords = interimTranscript.split(/\s+/).filter(Boolean);

  return (
    <>
      <div className="rounded-xl bg-card p-4 shadow-sm">
        <p className="text-sm text-foreground leading-relaxed">
          {transcriptWords.map((word, i) => renderWord(word, i, false))}
          {interimWords.map((word, i) => renderWord(word, transcriptWords.length + i, true))}
        </p>
      </div>

      <WordExplanationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        word={selectedWord || ""}
        explanation={explanation}
        isLoading={loadingExplanation}
        isJargon={isJargon}
      />
    </>
  );
}
