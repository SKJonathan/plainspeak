-- Make moment_id nullable to allow standalone jargon terms
ALTER TABLE public.jargon_terms 
ALTER COLUMN moment_id DROP NOT NULL;

-- Drop the existing foreign key constraint and recreate it with ON DELETE SET NULL
ALTER TABLE public.jargon_terms 
DROP CONSTRAINT IF EXISTS jargon_terms_moment_id_fkey;

ALTER TABLE public.jargon_terms 
ADD CONSTRAINT jargon_terms_moment_id_fkey 
FOREIGN KEY (moment_id) REFERENCES public.captured_moments(id) ON DELETE SET NULL;