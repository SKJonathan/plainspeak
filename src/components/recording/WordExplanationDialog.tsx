import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookmarkPlus, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface WordExplanationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  word: string;
  explanation: string | null;
  isLoading: boolean;
  isJargon: boolean;
}

export function WordExplanationDialog({
  open,
  onOpenChange,
  word,
  explanation,
  isLoading,
  isJargon,
}: WordExplanationDialogProps) {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = async () => {
    if (!user || !explanation) return;

    setIsSaving(true);
    try {
      // First, create a jargon_term (without moment_id)
      const { data: termData, error: termError } = await supabase
        .from("jargon_terms")
        .insert({
          user_id: user.id,
          term: word,
          explanation: explanation,
          moment_id: null,
        })
        .select()
        .single();

      if (termError) throw termError;

      // Then, add to saved_terms
      const { error: savedError } = await supabase.from("saved_terms").insert({
        user_id: user.id,
        jargon_term_id: termData.id,
      });

      if (savedError) throw savedError;

      setIsSaved(true);
      toast({
        title: "Saved to library!",
        description: `"${word}" has been added to your library.`,
      });
    } catch (err) {
      console.error("Failed to save term:", err);
      toast({
        title: "Failed to save",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setIsSaved(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl">{word}</DialogTitle>
          {!isLoading && isJargon && (
            <DialogDescription className="text-xs text-primary">
              Technical term / Jargon
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-2">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : explanation ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {explanation}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              This appears to be a common word without a technical meaning.
            </p>
          )}
        </div>

        {explanation && !isLoading && (
          <div className="mt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving || isSaved}
              className="w-full"
              variant={isSaved ? "secondary" : "default"}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isSaved ? (
                <>
                  <Check className="h-4 w-4" />
                  Saved to Library
                </>
              ) : (
                <>
                  <BookmarkPlus className="h-4 w-4" />
                  Save to Library
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
