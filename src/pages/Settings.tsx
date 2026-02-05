import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { LogOut, User, Sparkles, Loader2 } from "lucide-react";

type ExplanationStyle = "eli5" | "teen" | "academic";

const styleOptions: { value: ExplanationStyle; label: string; description: string }[] = [
  {
    value: "eli5",
    label: "ELI5",
    description: "Simple, everyday language anyone can understand",
  },
  {
    value: "teen",
    label: "Teen / 16+",
    description: "Clear and complete explanations with some technical terms",
  },
  {
    value: "academic",
    label: "Academic",
    description: "Formal definitions with proper terminology",
  },
];

export default function Settings() {
  const { user, signOut } = useAuth();
  const [explanationStyle, setExplanationStyle] = useState<ExplanationStyle>("teen");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("explanation_style")
        .eq("id", user.id)
        .maybeSingle();

      if (!error && data) {
        setExplanationStyle(data.explanation_style as ExplanationStyle);
      }
      setLoading(false);
    }

    fetchProfile();
  }, [user]);

  const handleStyleChange = async (value: ExplanationStyle) => {
    if (!user) return;

    setSaving(true);
    setExplanationStyle(value);

    const { error } = await supabase
      .from("profiles")
      .update({ explanation_style: value })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      toast({ title: "Failed to save", variant: "destructive" });
    } else {
      toast({ title: "Settings saved!" });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out successfully" });
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize your experience
        </p>
      </header>

      {/* Account */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Account</CardTitle>
              <CardDescription className="text-xs">
                {user?.email}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Explanation Style */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-accent/10 p-2">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div>
              <CardTitle className="text-base">Explanation Style</CardTitle>
              <CardDescription className="text-xs">
                How should AI explain jargon terms?
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={explanationStyle}
            onValueChange={(value) => handleStyleChange(value as ExplanationStyle)}
            className="space-y-3"
            disabled={saving}
          >
            {styleOptions.map((option) => (
              <div
                key={option.value}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Button
        variant="outline"
        className="w-full text-destructive hover:bg-destructive/10"
        onClick={handleSignOut}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
