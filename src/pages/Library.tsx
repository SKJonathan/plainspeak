import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Trash2, FolderOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SavedTerm {
  id: string;
  jargon_term_id: string;
  subject_id: string | null;
  jargon_terms: {
    term: string;
    explanation: string;
  };
}

export default function Library() {
  const { user } = useAuth();
  const [savedTerms, setSavedTerms] = useState<SavedTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchLibrary() {
      if (!user) return;

      const { data, error } = await supabase
        .from("saved_terms")
        .select(`
          id,
          jargon_term_id,
          subject_id,
          jargon_terms (
            term,
            explanation
          )
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching library:", error);
      } else {
        setSavedTerms((data as unknown as SavedTerm[]) || []);
      }
      setLoading(false);
    }

    fetchLibrary();
  }, [user]);

  const removeTerm = async (savedTermId: string) => {
    const { error } = await supabase
      .from("saved_terms")
      .delete()
      .eq("id", savedTermId);

    if (!error) {
      setSavedTerms(prev => prev.filter(t => t.id !== savedTermId));
      toast({ title: "Removed from library" });
    }
  };

  const filteredTerms = savedTerms.filter(item =>
    item.jargon_terms?.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.jargon_terms?.explanation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading library...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Your Library</h1>
        <p className="text-sm text-muted-foreground">
          Terms you've saved for review
        </p>
      </header>

      {savedTerms.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-medium">No saved terms yet</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            When you capture moments and find jargon, save them here for easy review!
          </p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search your terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Terms list */}
          <div className="space-y-3">
            {filteredTerms.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      {item.jargon_terms?.term}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTerm(item.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.jargon_terms?.explanation}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTerms.length === 0 && searchQuery && (
            <div className="py-8 text-center text-muted-foreground">
              No terms match "{searchQuery}"
            </div>
          )}
        </>
      )}
    </div>
  );
}
