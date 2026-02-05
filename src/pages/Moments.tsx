import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Clock, ChevronRight, Inbox } from "lucide-react";

interface Moment {
  id: string;
  transcript: string;
  created_at: string;
  duration_seconds: number | null;
}

export default function Moments() {
  const { user } = useAuth();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMoments() {
      if (!user) return;
      
      const { data, error } = await supabase
        .from("captured_moments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching moments:", error);
      } else {
        setMoments(data || []);
      }
      setLoading(false);
    }

    fetchMoments();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading moments...</div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Captured Moments</h1>
        <p className="text-sm text-muted-foreground">
          Your recorded lecture snippets
        </p>
      </header>

      {moments.length === 0 ? (
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <Inbox className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-medium">No moments yet</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            Go to the Record tab and capture your first lecture moment!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {moments.map((moment) => (
            <Link key={moment.id} to={`/moments/${moment.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(moment.created_at), { addSuffix: true })}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-3 text-sm text-foreground">
                    {moment.transcript}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
