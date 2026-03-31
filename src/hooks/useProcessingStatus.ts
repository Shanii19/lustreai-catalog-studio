import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type JobType = "enhance" | "model_render" | "zoom";
export type JobStatus = "queued" | "processing" | "complete" | "failed";

export interface ProcessingJob {
  id: string;
  project_id: string;
  image_id: string;
  job_type: JobType;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface ProcessingSummary {
  total: number;
  complete: number;
  processing: number;
  failed: number;
  queued: number;
}

export function useProcessingStatus(projectId: string | undefined) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial jobs
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    supabase
      .from("processing_jobs")
      .select("*")
      .eq("project_id", projectId)
      .then(({ data }) => {
        if (data) setJobs(data as unknown as ProcessingJob[]);
        setLoading(false);
      });
  }, [projectId]);

  // Realtime subscription
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`processing-jobs-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "processing_jobs",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newJob = payload.new as ProcessingJob;
          const oldJob = payload.old as Partial<ProcessingJob>;

          if (payload.eventType === "INSERT") {
            setJobs((prev) => [...prev, newJob]);
          } else if (payload.eventType === "UPDATE") {
            setJobs((prev) =>
              prev.map((j) => (j.id === newJob.id ? newJob : j))
            );
            // Show toasts on status transitions
            if (newJob.status === "complete" && oldJob?.status !== "complete") {
              const label =
                newJob.job_type === "enhance"
                  ? "Enhancement complete"
                  : newJob.job_type === "model_render"
                  ? "Model render complete"
                  : "Zoom shot ready";
              toast.success(label);
            }
            if (newJob.status === "failed") {
              toast.error(
                newJob.error_message || "A processing job failed"
              );
            }
          } else if (payload.eventType === "DELETE") {
            setJobs((prev) => prev.filter((j) => j.id !== oldJob.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const getJobsForImage = useCallback(
    (imageId: string, jobType?: JobType) =>
      jobs.filter(
        (j) =>
          j.image_id === imageId && (jobType ? j.job_type === jobType : true)
      ),
    [jobs]
  );

  const getJobsByType = useCallback(
    (jobType: JobType) => jobs.filter((j) => j.job_type === jobType),
    [jobs]
  );

  const summary = useCallback(
    (jobType?: JobType): ProcessingSummary => {
      const filtered = jobType
        ? jobs.filter((j) => j.job_type === jobType)
        : jobs;
      return {
        total: filtered.length,
        complete: filtered.filter((j) => j.status === "complete").length,
        processing: filtered.filter((j) => j.status === "processing").length,
        failed: filtered.filter((j) => j.status === "failed").length,
        queued: filtered.filter((j) => j.status === "queued").length,
      };
    },
    [jobs]
  );

  const createJob = useCallback(
    async (imageId: string, jobType: JobType) => {
      if (!projectId) return null;
      const { data, error } = await supabase
        .from("processing_jobs")
        .insert({
          project_id: projectId,
          image_id: imageId,
          job_type: jobType as string,
          status: "queued",
          progress: 0,
        } as any)
        .select()
        .single();
      if (error) {
        toast.error("Failed to queue job");
        return null;
      }
      return data as unknown as ProcessingJob;
    },
    [projectId]
  );

  const retryJob = useCallback(
    async (imageId: string, jobType: JobType) => {
      // Remove failed job(s) for this image + type, then create a new one
      const failed = jobs.filter(
        (j) =>
          j.image_id === imageId &&
          j.job_type === jobType &&
          j.status === "failed"
      );
      for (const j of failed) {
        await supabase.from("processing_jobs").delete().eq("id", j.id);
      }
      return createJob(imageId, jobType);
    },
    [jobs, createJob]
  );

  return {
    jobs,
    loading,
    getJobsForImage,
    getJobsByType,
    summary,
    createJob,
    retryJob,
  };
}
