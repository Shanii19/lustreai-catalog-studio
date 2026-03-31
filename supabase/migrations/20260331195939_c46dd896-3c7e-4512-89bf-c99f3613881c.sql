
-- Monthly usage tracking table
CREATE TABLE public.monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  month TEXT NOT NULL, -- format: YYYY-MM
  images_enhanced INTEGER NOT NULL DEFAULT 0,
  models_generated INTEGER NOT NULL DEFAULT 0,
  zoom_shots_generated INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

-- Enable RLS
ALTER TABLE public.monthly_usage ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view their own usage"
  ON public.monthly_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own usage
CREATE POLICY "Users can insert their own usage"
  ON public.monthly_usage FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own usage
CREATE POLICY "Users can update their own usage"
  ON public.monthly_usage FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Service role function to increment usage (called from edge functions)
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_user_id UUID,
  p_field TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_month TEXT := to_char(now(), 'YYYY-MM');
BEGIN
  INSERT INTO public.monthly_usage (user_id, month)
  VALUES (p_user_id, current_month)
  ON CONFLICT (user_id, month) DO NOTHING;

  IF p_field = 'images_enhanced' THEN
    UPDATE public.monthly_usage SET images_enhanced = images_enhanced + 1, updated_at = now()
    WHERE user_id = p_user_id AND month = current_month;
  ELSIF p_field = 'models_generated' THEN
    UPDATE public.monthly_usage SET models_generated = models_generated + 1, updated_at = now()
    WHERE user_id = p_user_id AND month = current_month;
  ELSIF p_field = 'zoom_shots_generated' THEN
    UPDATE public.monthly_usage SET zoom_shots_generated = zoom_shots_generated + 1, updated_at = now()
    WHERE user_id = p_user_id AND month = current_month;
  END IF;
END;
$$;

-- Storage bucket for avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- API keys table (encrypted storage TODO: integrate Supabase Vault)
CREATE TABLE public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key_type TEXT NOT NULL, -- 'enhancement' or 'image_generation'
  encrypted_key TEXT NOT NULL, -- TODO: Use Supabase Vault for proper encryption
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, key_type)
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own API keys"
  ON public.user_api_keys FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
