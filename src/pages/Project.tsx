import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import StageProgressBar from "@/components/StageProgressBar";
import UploadStage from "@/components/UploadStage";
import EnhanceStage from "@/components/EnhanceStage";
import ModelRenderStage from "@/components/ModelRenderStage";
import ZoomExportStage from "@/components/ZoomExportStage";
import ProjectComplete from "@/components/ProjectComplete";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Project = () => {
  const { id } = useParams<{ id: string }>();
  const [projectName, setProjectName] = useState("");
  const [stage, setStage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploadedImages, setUploadedImages] = useState<{ id: string; url: string; name: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    // Fetch project name
    supabase.from("projects").select("name").eq("id", id).single().then(({ data }) => {
      if (data) setProjectName(data.name);
      setLoading(false);
    });
    // Fetch existing images
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
        {/* Project header */}
        <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
          <div>
            <h1 className="font-heading text-xl font-bold">{projectName || "Project"}</h1>
          </div>
        </header>

        {/* Stage bar */}
        <StageProgressBar current={stage} />

        {/* Stage content */}
        {stage === 0 && (
          <UploadStage
            projectId={id!}
            onComplete={() => setStage(1)}
            uploadedImages={uploadedImages}
            setUploadedImages={setUploadedImages}
          />
        )}
        {stage === 1 && (
          <EnhanceStage
            images={uploadedImages}
            onComplete={() => setStage(2)}
          />
        )}
        {stage === 2 && (
          <ModelRenderStage
            images={uploadedImages}
            onComplete={() => setStage(3)}
          />
        )}
        {stage === 3 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground font-heading">Export — coming soon</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Project;
