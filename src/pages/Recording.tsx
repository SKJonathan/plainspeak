import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useElevenLabsTranscription } from "@/hooks/useElevenLabsTranscription";
import { useJargonDetection } from "@/hooks/useJargonDetection";
import { RecordingButton } from "@/components/recording/RecordingButton";
import { ClickableTranscript } from "@/components/recording/ClickableTranscript";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, Wifi, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type AudioSource = "microphone" | "computer" | "both";

export default function Recording() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureTimeout, setCaptureTimeout] = useState<NodeJS.Timeout | null>(null);
  const [audioSource, setAudioSource] = useState<AudioSource>("microphone");

  useEffect(() => {
    async function fetchAudioSource() {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("audio_source")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.audio_source) setAudioSource(data.audio_source as AudioSource);
    }
    fetchAudioSource();
  }, [user]);

  const {
    isListening,
    isConnecting,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    getBufferedTranscript,
    clearTranscript,
    error,
  } = useElevenLabsTranscription({ audioSource });

  const {
    detectedJargon,
    isDetecting,
    explanationCache,
    explainWord,
    isExplaining,
  } = useJargonDetection({
    transcript,
    isListening,
    detectionIntervalMs: 5000,
  });

  const startCapture = useCallback(() => {
    setIsCapturing(true);
    
    const timeout = setTimeout(async () => {
      await saveCapture();
    }, 15000);
    
    setCaptureTimeout(timeout);
  }, []);

  const cancelCapture = useCallback(() => {
    if (captureTimeout) {
      clearTimeout(captureTimeout);
      setCaptureTimeout(null);
    }
    setIsCapturing(false);
  }, [captureTimeout]);

  const saveCapture = async () => {
    setIsCapturing(false);
    setCaptureTimeout(null);
    
    // Get full transcript from buffer (last 60 seconds + capture time)
    const fullTranscript = getBufferedTranscript(75); // 60s buffer + 15s capture
    
    if (!fullTranscript.trim()) {
      toast({
        title: "No speech detected",
        description: "Try speaking louder or check your microphone.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Save to database
      const { data, error } = await supabase
        .from("captured_moments")
        .insert({
          user_id: user!.id,
          transcript: fullTranscript,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Moment captured!",
        description: "You can review it later in Moments.",
      });

      // Clear transcript but stay on recording page
      clearTranscript();
      
    } catch (err) {
      console.error("Failed to save moment:", err);
      toast({
        title: "Failed to save",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-between p-6">
      {/* Header */}
      <div className="w-full text-center">
        <h1 className="text-2xl font-bold text-foreground">PlainSpeak</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isConnecting ? "Connecting..." : isListening ? "Listening to your lecture..." : "Ready to capture"}
        </p>
        {isListening && isDetecting && (
          <div className="mt-2 flex items-center justify-center gap-1 text-xs text-primary">
            <Sparkles className="h-3 w-3 animate-pulse" />
            <span>Detecting jargon...</span>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mx-auto max-w-sm mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Transcript preview */}
      <div className="w-full max-w-md flex-1 overflow-y-auto py-6">
        {(transcript || interimTranscript) && (
          <ClickableTranscript
            transcript={transcript}
            interimTranscript={interimTranscript}
            detectedJargon={detectedJargon}
            explanationCache={explanationCache}
            onExplainWord={explainWord}
            isExplaining={isExplaining}
          />
        )}
        
        {isListening && !transcript && !interimTranscript && (
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Wifi className="h-6 w-6 animate-pulse" />
            <p className="text-sm">Waiting for speech...</p>
          </div>
        )}
      </div>

      {/* Recording controls */}
      <div className="pb-4 flex-shrink-0 flex flex-col items-center gap-6">
        {!isListening && !isConnecting ? (
          <RecordingButton
            isListening={false}
            isCapturing={false}
            isConnecting={isConnecting}
            onTap={startListening}
          />
        ) : isCapturing ? (
          <div className="flex flex-col items-center gap-4">
            <RecordingButton
              isListening={true}
              isCapturing={true}
              isConnecting={false}
              onTap={saveCapture}
            />
            <button
              onClick={cancelCapture}
              className="mt-8 text-sm text-muted-foreground underline"
            >
              Cancel capture
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <RecordingButton
              isListening={true}
              isCapturing={false}
              isConnecting={false}
              onTap={startCapture}
            />
            <button
              onClick={stopListening}
              className="mt-8 text-sm text-muted-foreground underline"
            >
              Stop listening
            </button>
          </div>
        )}
      </div>

      {/* Instructions - only show when not in initial state to avoid overlap */}
      {(isCapturing || isListening || isConnecting) && (
        <div className="text-center text-xs text-muted-foreground pb-4 flex-shrink-0">
          {isCapturing ? (
            <p>Capturing moment... Tap Stop & Save when ready</p>
          ) : isListening ? (
            <p>Tap any word to see its meaning • Tap mic to capture moment</p>
          ) : isConnecting ? (
            <p>Setting up transcription...</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
