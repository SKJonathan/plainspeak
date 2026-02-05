import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brain, ChevronLeft, ChevronRight, Eye, EyeOff, Shuffle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface FlashcardTerm {
  id: string;
  term: string;
  explanation: string;
}

export default function Focus() {
  const { user } = useAuth();
  const [terms, setTerms] = useState<FlashcardTerm[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTerms() {
      if (!user) return;

      const { data, error } = await supabase
        .from("saved_terms")
        .select(`
          jargon_terms (
            id,
            term,
            explanation
          )
        `);

      if (!error && data) {
        const flashcards = data
          .map((item: { jargon_terms: FlashcardTerm | null }) => item.jargon_terms)
          .filter((t): t is FlashcardTerm => t !== null);
        setTerms(flashcards);
      }
      setLoading(false);
    }

    fetchTerms();
  }, [user]);

  const shuffle = () => {
    const shuffled = [...terms].sort(() => Math.random() - 0.5);
    setTerms(shuffled);
    setCurrentIndex(0);
    setShowAnswer(false);
  };

  const goNext = () => {
    setShowAnswer(false);
    setCurrentIndex((prev) => (prev + 1) % terms.length);
  };

  const goPrev = () => {
    setShowAnswer(false);
    setCurrentIndex((prev) => (prev - 1 + terms.length) % terms.length);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading flashcards...</div>
      </div>
    );
  }

  if (terms.length === 0) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center p-4 text-center">
        <div className="mb-4 rounded-full bg-muted p-4">
          <Brain className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="mb-2 text-lg font-medium">No flashcards yet</h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Save some jargon terms to your library to start studying!
        </p>
      </div>
    );
  }

  const currentTerm = terms[currentIndex];

  return (
    <div className="flex min-h-[80vh] flex-col p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Focus Mode</h1>
          <p className="text-sm text-muted-foreground">
            {currentIndex + 1} of {terms.length} cards
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={shuffle}>
          <Shuffle className="h-4 w-4" />
        </Button>
      </header>

      {/* Flashcard */}
      <div className="flex flex-1 items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-sm"
          >
            <Card
              className={cn(
                "cursor-pointer p-6 transition-all",
                showAnswer ? "min-h-[300px]" : "min-h-[200px]"
              )}
              onClick={() => setShowAnswer(!showAnswer)}
            >
              <div className="flex h-full flex-col items-center justify-center text-center">
                {!showAnswer ? (
                  <>
                    <p className="mb-4 text-2xl font-bold text-foreground">
                      {currentTerm.term}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Eye className="h-4 w-4" />
                      <span>Tap to reveal</span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-lg font-medium text-accent">
                      {currentTerm.term}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {currentTerm.explanation}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                      <EyeOff className="h-3 w-3" />
                      <span>Tap to hide</span>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 pt-6">
        <Button variant="outline" size="icon" onClick={goPrev}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex gap-1">
          {terms.map((_, idx) => (
            <div
              key={idx}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                idx === currentIndex ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
        <Button variant="outline" size="icon" onClick={goNext}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
