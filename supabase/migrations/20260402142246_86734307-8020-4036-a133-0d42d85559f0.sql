-- 1. Remove client INSERT/UPDATE policies on monthly_usage (usage should only be written server-side via increment_usage function)
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.monthly_usage;
DROP POLICY IF EXISTS "Users can update their own usage" ON public.monthly_usage;

-- 2. Add missing DELETE policy for avatars storage bucket
CREATE POLICY "Users can delete their own avatar"
ON storage.objects
FOR DELETE
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);