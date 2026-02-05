-- Create explanation style enum
CREATE TYPE public.explanation_style AS ENUM ('eli5', 'teen', 'academic');

-- Create profiles table (uses auth.uid() as primary key)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    explanation_style explanation_style NOT NULL DEFAULT 'teen',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create subjects table
CREATE TABLE public.subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create captured_moments table
CREATE TABLE public.captured_moments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    transcript TEXT NOT NULL,
    audio_url TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create jargon_terms table
CREATE TABLE public.jargon_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moment_id UUID NOT NULL REFERENCES public.captured_moments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    explanation TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create saved_terms table (user's library)
CREATE TABLE public.saved_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    jargon_term_id UUID NOT NULL REFERENCES public.jargon_terms(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, jargon_term_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jargon_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_terms ENABLE ROW LEVEL SECURITY;

-- Profiles policies (user can only read/update their own profile)
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Subjects policies
CREATE POLICY "Users can view own subjects"
    ON public.subjects FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subjects"
    ON public.subjects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subjects"
    ON public.subjects FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own subjects"
    ON public.subjects FOR DELETE
    USING (auth.uid() = user_id);

-- Captured moments policies
CREATE POLICY "Users can view own moments"
    ON public.captured_moments FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own moments"
    ON public.captured_moments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own moments"
    ON public.captured_moments FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own moments"
    ON public.captured_moments FOR DELETE
    USING (auth.uid() = user_id);

-- Jargon terms policies
CREATE POLICY "Users can view own jargon terms"
    ON public.jargon_terms FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jargon terms"
    ON public.jargon_terms FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own jargon terms"
    ON public.jargon_terms FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own jargon terms"
    ON public.jargon_terms FOR DELETE
    USING (auth.uid() = user_id);

-- Saved terms policies
CREATE POLICY "Users can view own saved terms"
    ON public.saved_terms FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own saved terms"
    ON public.saved_terms FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved terms"
    ON public.saved_terms FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved terms"
    ON public.saved_terms FOR DELETE
    USING (auth.uid() = user_id);

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subjects_updated_at
    BEFORE UPDATE ON public.subjects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_subjects_user_id ON public.subjects(user_id);
CREATE INDEX idx_captured_moments_user_id ON public.captured_moments(user_id);
CREATE INDEX idx_jargon_terms_user_id ON public.jargon_terms(user_id);
CREATE INDEX idx_jargon_terms_moment_id ON public.jargon_terms(moment_id);
CREATE INDEX idx_saved_terms_user_id ON public.saved_terms(user_id);
CREATE INDEX idx_saved_terms_subject_id ON public.saved_terms(subject_id);