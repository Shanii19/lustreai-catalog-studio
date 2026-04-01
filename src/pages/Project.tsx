import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import StageProgressBar from "@/components/StageProgressBar";
import UploadStage from "@/components/UploadStage";
import EnhanceStage from "@/components/EnhanceStage";
import ModelRenderStage from "@/components/ModelRenderStage";
import ZoomExportStage from "@/components/ZoomExportStage";
import ProjectComplete from "@/components/ProjectComplete";
import ProcessingSummaryBar from "@/components/ProcessingSummaryBar";
import { useProcessingStatus } from "@/hooks/useProcessingStatus";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { enhanceAllImages } from "@/services/enhancementService";
import { generateAllModelRenders } from "@/services/modelRenderService";
import { generateAllZoomShots } from "@/services/zoomGenerationService";
import { useAuth } from "@/contexts/AuthContext";

const STAGE_JOB_MAP = {
  1: "enhance",
  2: "model_render",
  3: "zoom",
} as const;

const Project = () => {
  const { id } = useParams<{ id: string }>();
  const [projectName, setProjectName] = useState("");
  const [stage, setStage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploadedImages, setUploadedImages] = useState<{ id: string; url: string; name: string }[]>([]);
  const [showComplete, setShowComplete] = useState(false);

  const { user } = useAuth();
  const { jobs, summary, retryJob, getJobsByType } = useProcessingStatus(id);

  useEffect(() => {
    if (!id) return;
    supabase.from("projects").select("name").eq("id", id).single().then(({ data }) => {
      if (data) setProjectName(data.name);
      setLoading(false);
    });
    supabase
      .from("project_images")
      .select("id, storage_url")
      .eq("project_id", id)
      .eq("type", "original")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setUploadedImages(data.map((img) => ({
            id: img.id,
            url: img.storage_url,
            name: img.storage_url.split("/").pop() || "image",
          })));
        }
      });
  }, [id]);

  const handleUploadComplete = async () => {
    toast.success("Upload complete — starting enhancement");
    setStage(1);
    // Trigger enhancement for all uploaded images
    if (user && id) {
      enhanceAllImages(uploadedImages, id, user.id).then(({ succeeded, failed }) => {
        if (failed > 0) toast.error(`${failed} image(s) failed to enhance`);
        if (succeeded > 0) toast.success(`${succeeded} image(s) enhanced successfully`);
      });
    }
  };

  const handleRetry = async (imageId: string, jobType: "enhance" | "model_render" | "zoom") => {
    await retryJob(imageId, jobType);
    toast.info("Job re-queued");
  };

  const currentJobType = STAGE_JOB_MAP[stage as keyof typeof STAGE_JOB_MAP];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col min-h-screen">
        <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <h1 className="font-heading text-xl font-bold">{projectName || "Project"}</h1>
          </div>
        </header>

        <StageProgressBar current={stage} />

        {/* Processing summary bar */}
        {currentJobType && (
          <ProcessingSummaryBar
            summary={summary(currentJobType)}
            jobType={currentJobType}
          />
        )}

        {stage === 0 && (
          <UploadStage
            projectId={id!}
            onComplete={handleUploadComplete}
            uploadedImages={uploadedImages}
            setUploadedImages={setUploadedImages}
          />
        )}
        {stage === 1 && (
          <EnhanceStage
            images={uploadedImages}
            onComplete={() => {
              toast.success("Enhancement complete");
              setStage(2);
              // Trigger model rendering for all images
              if (user && id) {
                generateAllModelRenders(uploadedImages, id, user.id).then(({ succeeded, failed }) => {
                  if (failed > 0) toast.error(`${failed} model render(s) failed`);
                  if (succeeded > 0) toast.success(`${succeeded} model render(s) complete`);
                });
              }
            }}
            jobs={getJobsByType("enhance")}
            onRetry={(imageId) => handleRetry(imageId, "enhance")}
          />
        )}
        {stage === 2 && (
          <ModelRenderStage
            images={uploadedImages}
            onComplete={(selectedModels) => {
              toast.success("Model rendering complete — starting 4K zoom generation");
              setStage(3);
              if (user && id) {
                // Use the selected model images for zoom generation, not originals
                const modelImages = selectedModels.map((sm) => ({
                  id: sm.imageId,
                  url: sm.modelUrl,
                  name: `model_${sm.imageId}`,
                }));
                setUploadedImages((prev) => {
                  // Store selected model URLs for the zoom stage to reference
                  return prev;
                });
                generateAllZoomShots(modelImages, id, user.id).then(({ succeeded, failed }) => {
                  if (failed > 0) toast.error(`${failed} zoom generation(s) failed`);
                  if (succeeded > 0) toast.success(`${succeeded} zoom set(s) generated`);
                });
              }
            }}
            jobs={getJobsByType("model_render")}
            onRetry={(imageId) => handleRetry(imageId, "model_render")}
          />
        )}
        {stage === 3 && !showComplete && (
          <ZoomExportStage
            images={uploadedImages}
            onComplete={async () => {
              if (id) {
                await supabase.from("projects").update({ status: "complete" }).eq("id", id);
              }
              toast.success("Export ready!");
              setShowComplete(true);
            }}
            jobs={getJobsByType("zoom")}
            onRetry={(imageId) => handleRetry(imageId, "zoom")}
          />
        )}
        {showComplete && (
          <ProjectComplete
            imageCount={uploadedImages.length * 4}
            projectName={projectName}
          />
        )}
      </main>
    </div>
  );
};

export default Project;
