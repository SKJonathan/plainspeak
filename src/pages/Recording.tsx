import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { RecordingButton } from "@/components/recording/RecordingButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, Wifi } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Recording() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureTimeout, setCaptureTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    getBufferedTranscript,
    clearTranscript,
    error,
  } = useSpeechRecognition();

  const handleCapture = useCallback(async () => {
    if (!isListening) {
      // Start listening
      startListening();
      return;
    }

    if (isCapturing) {
      // Stop capturing early
      if (captureTimeout) {
        clearTimeout(captureTimeout);
        setCaptureTimeout(null);
      }
      await saveCapture();
      return;
    }

    // Start capture - get buffer + continue for 15 more seconds
    setIsCapturing(true);
    
    const timeout = setTimeout(async () => {
      await saveCapture();
    }, 15000);
    
    setCaptureTimeout(timeout);
  }, [isListening, isCapturing, captureTimeout, startListening]);

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
        description: "Analyzing for jargon terms...",
      });

      // Clear transcript and navigate to moment details
      clearTranscript();
      
      // Trigger jargon analysis (will be added later)
      navigate(`/moments/${data.id}`);
      
    } catch (err) {
      console.error("Failed to save moment:", err);
      toast({
        title: "Failed to save",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!isSupported) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Speech recognition is not supported in this browser. 
            Please try Chrome, Safari, or Edge.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-between p-6">
      {/* Header */}
      <div className="w-full text-center">
        <h1 className="text-2xl font-bold text-foreground">LectureSnap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isListening ? "Listening to your lecture..." : "Ready to capture"}
        </p>
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mx-auto max-w-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Transcript preview */}
      <div className="w-full max-w-md flex-1 overflow-hidden py-6">
        {(transcript || interimTranscript) && (
          <div className="rounded-xl bg-card p-4 shadow-sm">
            <p className="text-sm text-foreground">
              {transcript}
              <span className="text-muted-foreground">{interimTranscript}</span>
            </p>
          </div>
        )}
        
        {isListening && !transcript && !interimTranscript && (
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Wifi className="h-6 w-6 animate-pulse" />
            <p className="text-sm">Waiting for speech...</p>
          </div>
        )}
      </div>

      {/* Recording button */}
      <div className="pb-8">
        <RecordingButton
          isListening={isListening}
          isCapturing={isCapturing}
          onTap={handleCapture}
        />
      </div>

      {/* Instructions */}
      <div className="text-center text-xs text-muted-foreground">
        {isCapturing ? (
          <p>Recording for 15 seconds... Tap again to stop early</p>
        ) : isListening ? (
          <p>Tap the button when you hear something confusing</p>
        ) : (
          <p>Start listening to buffer your lecture in the background</p>
        )}
      </div>
    </div>
  );
}
