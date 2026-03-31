import { supabase } from "@/integrations/supabase/client";

// TODO: These will be replaced when a real enhancement provider is configured
// The edge function handles the actual API call server-side

interface EnhanceRequest {
  imageUrl: string;
  projectId: string;
  imageId: string;
  userId: string;
}

interface EnhanceResult {
  success: boolean;
  enhanced_url?: string;
  error?: string;
}

/**
 * Triggers enhancement for a single image via the enhance-image edge function.
 * The edge function handles:
 * - Calling the external enhancement API (with retry logic)
 * - Uploading the enhanced image to storage
 * - Updating processing_jobs status in real-time
 * - Creating the enhanced project_images record
 */
export async function enhanceImage({ imageUrl, projectId, imageId, userId }: EnhanceRequest): Promise<EnhanceResult> {
  const { data, error } = await supabase.functions.invoke("enhance-image", {
    body: {
      image_url: imageUrl,
      project_id: projectId,
      image_id: imageId,
      user_id: userId,
    },
  });

  if (error) {
    console.error("Enhancement invocation error:", error);
    return { success: false, error: error.message };
  }

  return data as EnhanceResult;
}

/**
 * Triggers enhancement for all uploaded images in a project.
 * Each image is processed independently — failures don't block others.
 * Progress updates flow through Supabase realtime via processing_jobs table.
 */
export async function enhanceAllImages(
  images: { id: string; url: string; name: string }[],
  projectId: string,
  userId: string
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(
    images.map((img) =>
      enhanceImage({
        imageUrl: img.url,
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
