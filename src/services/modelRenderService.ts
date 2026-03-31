import { supabase } from "@/integrations/supabase/client";

// TODO: The edge function handles the actual API calls server-side
// Configure MODEL_GEN_API_KEY and MODEL_GEN_API_URL as backend secrets

interface ModelRenderRequest {
  enhancedImageUrl: string;
  projectId: string;
  imageId: string;
  userId: string;
}

interface ModelRenderResult {
  success: boolean;
  model_urls?: string[];
  error?: string;
}

/**
 * Triggers model render generation for a single enhanced image.
 * The edge function generates 3 model variants (close-up, half-body, editorial)
 * and updates processing_jobs in real-time.
 */
export async function generateModelRenders({
  enhancedImageUrl,
  projectId,
  imageId,
  userId,
}: ModelRenderRequest): Promise<ModelRenderResult> {
  const { data, error } = await supabase.functions.invoke("generate-model-renders", {
    body: {
      enhanced_image_url: enhancedImageUrl,
      project_id: projectId,
      image_id: imageId,
      user_id: userId,
    },
  });

  if (error) {
    console.error("Model render invocation error:", error);
    return { success: false, error: error.message };
  }

  return data as ModelRenderResult;
}

/**
 * Triggers model rendering for all enhanced images in a project.
 * Each image is processed independently — failures don't block others.
 * Progress updates flow through Supabase realtime via processing_jobs table.
 */
export async function generateAllModelRenders(
  images: { id: string; url: string; name: string }[],
  projectId: string,
  userId: string
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(
    images.map((img) =>
      generateModelRenders({
        enhancedImageUrl: img.url,
        projectId,
        imageId: img.id,
        userId,
      })
    )
  );

  let succeeded = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { succeeded, failed };
}
