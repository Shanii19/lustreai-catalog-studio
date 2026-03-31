
-- Create storage bucket for project images
INSERT INTO storage.buckets (id, name, public) VALUES ('project-images', 'project-images', true);

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload their own project images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to read their own files
CREATE POLICY "Users can read their own project images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access for displaying images
CREATE POLICY "Public read access for project images"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'project-images');

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own project images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text);
