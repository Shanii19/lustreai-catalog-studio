import { supabase } from "@/integrations/supabase/client";

interface ZoomRequest {
  jewelryImageUrl: string;
  projectId: string;
  imageId: string;
  userId: string;
}

interface ZoomResult {
  success: boolean;
  zoom_urls?: string[];
  error?: string;
}

/**
 * Triggers 4K zoom shot generation for a single jewelry image.
 * The edge function generates 4 angles (front, side, top-down, macro)
 * and updates processing_jobs in real-time.
 */
export async function generateZoomShots({
  jewelryImageUrl,
  projectId,
  imageId,
  userId,
}: ZoomRequest): Promise<ZoomResult> {
  const { data, error } = await supabase.functions.invoke("generate-zoom-shots", {
    body: {
      jewelry_image_url: jewelryImageUrl,
      project_id: projectId,
      image_id: imageId,
      user_id: userId,
    },
  });

  if (error) {
    console.error("Zoom generation invocation error:", error);
    return { success: false, error: error.message };
  }

  return data as ZoomResult;
}

/**
 * Triggers zoom shot generation for all images in a project.
 * Each image is processed independently — failures don't block others.
 */
export async function generateAllZoomShots(
  images: { id: string; url: string; name: string }[],
  projectId: string,
  userId: string
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(
    images.map((img) =>
      generateZoomShots({
        jewelryImageUrl: img.url,
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
