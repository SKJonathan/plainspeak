
-- Create audio_source enum
CREATE TYPE public.audio_source AS ENUM ('microphone', 'computer', 'both');

-- Add audio_source column to profiles
ALTER TABLE public.profiles
ADD COLUMN audio_source public.audio_source NOT NULL DEFAULT 'microphone';
