import { supabase } from "@/integrations/supabase/client";

interface JobStartResult {
  success: boolean;
  job_id?: string;
  error?: string;
}

interface JobCompletionResult {
  success: boolean;
  error?: string;
}

interface SequentialRunOptions {
  cooldownMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForProcessingJob(
  jobId: string,
  timeoutMs = 180_000,
  intervalMs = 2_000,
): Promise<JobCompletionResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase
      .from("processing_jobs")
      .select("status, error_message")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: "Processing job not found." };
    }

    if (data.status === "complete") {
      return { success: true };
    }

    if (data.status === "failed") {
      return {
        success: false,
        error: data.error_message || "Processing failed.",
      };
    }

    await sleep(intervalMs);
  }

  return {
    success: false,
    error: "Processing timed out. Please try again.",
  };
}

export async function runSequentialJobs<T>(
  items: T[],
  startJob: (item: T) => Promise<JobStartResult>,
  options: SequentialRunOptions = {},
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  const { cooldownMs = 1_500, timeoutMs = 180_000 } = options;
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const started = await startJob(items[index]);

    if (!started.success || !started.job_id) {
      failed += 1;
      if (started.error) errors.push(started.error);
    } else {
      const finished = await waitForProcessingJob(started.job_id, timeoutMs);

      if (finished.success) {
        succeeded += 1;
      } else {
        failed += 1;
        if (finished.error) errors.push(finished.error);
      }
    }

    if (index < items.length - 1 && cooldownMs > 0) {
      await sleep(cooldownMs);
    }
  }

  return { succeeded, failed, errors };
}