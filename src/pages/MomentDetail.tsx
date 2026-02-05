import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Trash2, Loader2, Bookmark, BookmarkCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface JargonTerm {
  id: string;
  term: string;
  explanation: string;
}

interface Moment {
  id: string;
  transcript: string;
  created_at: string;
}

export default function MomentDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [moment, setMoment] = useState<Moment | null>(null);
  const [jargonTerms, setJargonTerms] = useState<JargonTerm[]>([]);
  const [savedTermIds, setSavedTermIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!id || !user) return;

      // Fetch moment
      const { data: momentData, error: momentError } = await supabase
        .from("captured_moments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (momentError || !momentData) {
        toast({ title: "Moment not found", variant: "destructive" });
        navigate("/moments");
        return;
      }

      setMoment(momentData);

      // Fetch jargon terms for this moment
      const { data: termsData } = await supabase
        .from("jargon_terms")
        .select("*")
        .eq("moment_id", id);

      setJargonTerms(termsData || []);

      // Check which terms are saved
      if (termsData && termsData.length > 0) {
        const { data: savedData } = await supabase
          .from("saved_terms")
          .select("jargon_term_id")
          .in("jargon_term_id", termsData.map(t => t.id));

        setSavedTermIds(new Set(savedData?.map(s => s.jargon_term_id) || []));
      }

      setLoading(false);
    }

    fetchData();
  }, [id, user, navigate]);

  const analyzeJargon = async () => {
    if (!moment || !user) return;
    
    setAnalyzing(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("analyze-jargon", {
        body: { 
          transcript: moment.transcript,
          momentId: moment.id,
        },
      });

      if (error) throw error;

      setJargonTerms(data.terms || []);
      toast({ title: "Analysis complete!", description: `Found ${data.terms?.length || 0} terms.` });
    } catch (err) {
      console.error("Analysis failed:", err);
      toast({ 
        title: "Analysis failed", 
        description: "Please try again later.",
        variant: "destructive" 
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSaveTerm = async (termId: string) => {
    if (!user) return;

    const isSaved = savedTermIds.has(termId);

    if (isSaved) {
      // Remove from saved
      const { error } = await supabase
        .from("saved_terms")
        .delete()
        .eq("jargon_term_id", termId)
        .eq("user_id", user.id);

      if (!error) {
        setSavedTermIds(prev => {
          const next = new Set(prev);
          next.delete(termId);
          return next;
        });
        toast({ title: "Removed from library" });
      }
    } else {
      // Add to saved
      const { error } = await supabase
        .from("saved_terms")
        .insert({ jargon_term_id: termId, user_id: user.id });

      if (!error) {
        setSavedTermIds(prev => new Set(prev).add(termId));
        toast({ title: "Saved to library!" });
      }
    }
  };

  const deleteMoment = async () => {
    if (!moment) return;

    const { error } = await supabase
      .from("captured_moments")
      .delete()
      .eq("id", moment.id);

    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    } else {
      toast({ title: "Moment deleted" });
      navigate("/moments");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!moment) return null;

  return (
    <div className="p-4">
      {/* Header */}
      <header className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/moments")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Moment Details</h1>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(moment.created_at), { addSuffix: true })}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={deleteMoment}>
          <Trash2 className="h-5 w-5 text-destructive" />
        </Button>
      </header>

      {/* Transcript */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Transcript
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{moment.transcript}</p>
        </CardContent>
      </Card>

      {/* Analyze button */}
      {jargonTerms.length === 0 && (
        <Button 
          onClick={analyzeJargon} 
          disabled={analyzing}
          className="mb-4 w-full"
        >
          {analyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Analyze for Jargon
            </>
          )}
        </Button>
      )}

      {/* Jargon terms */}
      {jargonTerms.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Detected Terms ({jargonTerms.length})
          </h2>
          <div className="space-y-3">
            {jargonTerms.map((term) => (
              <Card key={term.id}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <span className="rounded-full bg-accent/20 px-3 py-1 text-sm font-medium text-accent">
                      {term.term}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleSaveTerm(term.id)}
                      className="h-8 w-8"
                    >
                      {savedTermIds.has(term.id) ? (
                        <BookmarkCheck className="h-4 w-4 text-primary" />
                      ) : (
                        <Bookmark className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{term.explanation}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
