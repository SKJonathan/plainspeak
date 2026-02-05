import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface RecordingButtonProps {
  isListening: boolean;
  isCapturing: boolean;
  onTap: () => void;
  disabled?: boolean;
}

export function RecordingButton({ 
  isListening, 
  isCapturing, 
  onTap, 
  disabled 
}: RecordingButtonProps) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer pulse ring when listening */}
      {isListening && (
        <motion.div
          className="absolute h-40 w-40 rounded-full bg-primary/10"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 0.2, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
      
      {/* Capturing pulse */}
      {isCapturing && (
        <motion.div
          className="absolute h-44 w-44 rounded-full bg-recording/20"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.6, 0.2, 0.6],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Main button */}
      <motion.button
        onClick={onTap}
        disabled={disabled}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "relative z-10 flex h-32 w-32 items-center justify-center rounded-full shadow-lg transition-colors focus:outline-none focus:ring-4 focus:ring-primary/30",
          isCapturing
            ? "bg-recording text-white"
            : isListening
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {isCapturing ? (
          <Square className="h-12 w-12 fill-current" />
        ) : (
          <Mic className={cn("h-14 w-14", isListening && "animate-pulse")} />
        )}
      </motion.button>

      {/* Status text */}
      <div className="absolute -bottom-12 text-center">
        <p className={cn(
          "text-sm font-medium",
          isCapturing 
            ? "text-recording" 
            : isListening 
              ? "text-primary" 
              : "text-muted-foreground"
        )}>
          {isCapturing 
            ? "Capturing..." 
            : isListening 
              ? "Tap to capture moment" 
              : "Tap to start listening"}
        </p>
      </div>
    </div>
  );
}
