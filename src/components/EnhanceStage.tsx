import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ProcessingJob } from "@/hooks/useProcessingStatus";

interface ImageItem {
  id: string;
  url: string;
  name: string;
}

interface Props {
  images: ImageItem[];
  onComplete: () => void;
  jobs: ProcessingJob[];
  onRetry?: (imageId: string) => void;
}

const EnhanceStage = ({ images, onComplete, jobs, onRetry }: Props) => {
  const [mockEnhanced, setMockEnhanced] = useState<Set<string>>(new Set());

  // Mock enhancement when no real jobs exist
  const hasRealJobs = jobs.length > 0;

  useEffect(() => {
    if (hasRealJobs) return;
    images.forEach((img, i) => {
      const timer = setTimeout(() => {
        setMockEnhanced((prev) => new Set(prev).add(img.id));
      }, 3000 + i * 1500);
      return () => clearTimeout(timer);
    });
  }, [images, hasRealJobs]);

  const getStatus = (imageId: string) => {
    if (hasRealJobs) {
      const job = [...jobs]
        .filter((j) => j.image_id === imageId && j.job_type === "enhance")
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];

      if (!job) return { done: false, failed: false, progress: 0 };

      return {
        done: job.status === "complete",
        failed: job.status === "failed",
        progress: job.progress,
        errorMessage: job.error_message,
      };
    }
    return { done: mockEnhanced.has(imageId), failed: false, progress: mockEnhanced.has(imageId) ? 100 : 0 };
  };

  const allDone = images.every((img) => getStatus(img.id).done);
  const failedImages = images.filter((img) => getStatus(img.id).failed);

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6 fade-in-up">
      {/* Status */}
      <div className="flex items-center gap-3">
        {!allDone ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="font-heading text-lg font-semibold">AI is enhancing your jewelry images…</p>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="font-heading text-lg font-semibold">All images enhanced!</p>
          </>
        )}
      </div>

      {/* Before / After cards */}
      <div className="space-y-4">
        {images.map((img) => {
          const status = getStatus(img.id);
          return (
            <div key={img.id} className="relative grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border/50 bg-card p-4">
              {/* Original */}
              <div className="space-y-2">
                <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Original</Badge>
                <img src={img.url} alt={img.name} className="w-full rounded-lg object-cover max-h-64" />
              </div>
              {/* Enhanced */}
              <div className="space-y-2">
                {status.failed ? (
                  <>
                    <Badge variant="outline" className="text-[10px] bg-destructive/20 text-destructive">Failed</Badge>
                    <div className="w-full rounded-lg border-2 border-destructive/30 bg-destructive/5 max-h-64 h-48 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-2 text-center px-4">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                        <span className="text-sm text-destructive">{status.errorMessage || "Enhancement failed"}</span>
                        {onRetry && (
                          <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => onRetry(img.id)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Retry
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                ) : status.done ? (
                  <>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-400">Enhanced ✓</Badge>
                    <img src={img.url} alt={`Enhanced ${img.name}`} className="w-full rounded-lg object-cover max-h-64 brightness-110 contrast-105 saturate-110" />
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="text-[10px] bg-primary/20 text-primary">Enhancing…</Badge>
                    <div className="w-full rounded-lg bg-secondary/50 max-h-64 h-48 flex items-center justify-center animate-pulse">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        <span className="text-xs text-muted-foreground">Processing…</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {/* Progress bar at bottom */}
              {!status.done && !status.failed && status.progress > 0 && (
                <div className="absolute bottom-0 left-0 right-0 px-4 pb-1">
                  <Progress value={status.progress} className="h-1 [&>div]:bg-primary" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CTA */}
      {allDone && (
        <div className="flex justify-end pt-2">
          <Button onClick={onComplete} size="lg" className="gap-2 gold-glow-hover">
            Proceed to Model Rendering →
          </Button>
        </div>
      )}
      {failedImages.length > 0 && !allDone && (
        <p className="text-xs text-muted-foreground">
          {failedImages.length} image(s) failed and will be excluded from further processing.
        </p>
      )}
    </div>
  );
};

export default EnhanceStage;
