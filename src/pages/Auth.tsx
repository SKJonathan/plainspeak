import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Mic, BookOpen, Sparkles } from "lucide-react";

export default function Auth() {
  const { user, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const { error } = isLogin 
      ? await signIn(email, password)
      : await signUp(email, password);

    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else if (!isLogin) {
      toast({
        title: "Check your email",
        description: "We sent you a confirmation link to verify your account.",
      });
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 safe-top safe-bottom">
      {/* Hero section */}
      <div className="mb-8 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <div className="rounded-2xl bg-primary p-3">
            <Mic className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <h1 className="mb-2 text-3xl font-bold text-foreground">LectureSnap</h1>
        <p className="text-muted-foreground">Capture. Understand. Remember.</p>
      </div>

      {/* Features preview */}
      <div className="mb-8 flex gap-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <span>Record</span>
        </div>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <span>AI Explain</span>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-secondary" />
          <span>Learn</span>
        </div>
      </div>

      {/* Auth card */}
      <Card className="w-full max-w-sm border-0 shadow-lg">
        <CardHeader className="text-center">
          <CardTitle>{isLogin ? "Welcome back" : "Get started"}</CardTitle>
          <CardDescription>
            {isLogin 
              ? "Sign in to access your captured moments" 
              : "Create an account to start capturing lectures"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-12"
              />
            </div>
            <Button 
              type="submit" 
              className="h-12 w-full text-base font-medium"
              disabled={isSubmitting}
            >
              {isSubmitting 
                ? "Please wait..." 
                : isLogin 
                  ? "Sign in" 
                  : "Create account"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="font-medium text-primary hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
