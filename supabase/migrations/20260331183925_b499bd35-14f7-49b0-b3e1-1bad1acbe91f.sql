
-- processing_jobs table for tracking async job progress
CREATE TYPE public.job_type AS ENUM ('enhance', 'model_render', 'zoom');
CREATE TYPE public.job_status AS ENUM ('queued', 'processing', 'complete', 'failed');

CREATE TABLE public.processing_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES public.project_images(id) ON DELETE CASCADE,
  job_type public.job_type NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own processing jobs"
ON public.processing_jobs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects WHERE projects.id = processing_jobs.project_id AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can create processing jobs for their projects"
ON public.processing_jobs FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects WHERE projects.id = processing_jobs.project_id AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can update their own processing jobs"
ON public.processing_jobs FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects WHERE projects.id = processing_jobs.project_id AND projects.user_id = auth.uid()
));

CREATE POLICY "Users can delete their own processing jobs"
ON public.processing_jobs FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects WHERE projects.id = processing_jobs.project_id AND projects.user_id = auth.uid()
));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.processing_jobs;
