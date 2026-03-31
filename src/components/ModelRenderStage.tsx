import { useEffect, useState, useCallback } from "react";
import { Check, Maximize2, X, ZoomIn, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProcessingJob } from "@/hooks/useProcessingStatus";

interface ImageItem {
  id: string;
  url: string;
  name: string;
}

interface ModelVariant {
  id: string;
  url: string;
  progress: number;
  done: boolean;
}

interface Props {
  images: ImageItem[];
  onComplete: () => void;
  jobs: ProcessingJob[];
  onRetry?: (imageId: string) => void;
}

const generatePlaceholderUrl = (seed: number) =>
  `https://picsum.photos/seed/${seed}/400/600`;

const ModelRenderStage = ({ images, onComplete, jobs, onRetry }: Props) => {
  const [models, setModels] = useState<Record<string, ModelVariant[]>>({});
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ imageId: string; variantIdx: number } | null>(null);

  const hasRealJobs = jobs.length > 0;

  // Initialize model generation mock
  useEffect(() => {
    if (hasRealJobs) return;
    const initial: Record<string, ModelVariant[]> = {};
    images.forEach((img, imgIdx) => {
      initial[img.id] = [0, 1, 2].map((vi) => ({
        id: `${img.id}-model-${vi}`,
        url: generatePlaceholderUrl(imgIdx * 100 + vi * 37 + 1),
        progress: 0,
        done: false,
      }));
    });
    setModels(initial);

    const timers: NodeJS.Timeout[] = [];
    images.forEach((img, imgIdx) => {
      [0, 1, 2].forEach((vi) => {
        const baseDelay = (imgIdx * 3 + vi) * 800;
        const duration = 3000 + vi * 1000;
        const steps = 20;
        for (let s = 1; s <= steps; s++) {
          const timer = setTimeout(() => {
            setModels((prev) => {
              const variants = [...(prev[img.id] || [])];
              if (variants[vi]) {
                const pct = Math.min(Math.round((s / steps) * 100), 100);
                variants[vi] = { ...variants[vi], progress: pct, done: pct === 100 };
              }
              return { ...prev, [img.id]: variants };
            });
          }, baseDelay + (duration / steps) * s);
          timers.push(timer);
        }
      });
    });

    return () => timers.forEach(clearTimeout);
  }, [images, hasRealJobs]);

  const getJobStatus = (imageId: string) => {
    if (!hasRealJobs) return null;
    const job = jobs.find((j) => j.image_id === imageId && j.job_type === "model_render");
    return job || null;
  };

  const handleSelect = useCallback((imageId: string, variantId: string) => {
    setSelections((prev) => ({ ...prev, [imageId]: variantId }));
  }, []);

  const allSelected = images.length > 0 && images.every((img) => {
    const job = getJobStatus(img.id);
    if (job?.status === "failed") return true; // skip failed
    return selections[img.id];
  });

  const lightboxVariants = lightbox ? models[lightbox.imageId] : [];
  const lightboxCurrent = lightbox ? lightboxVariants?.[lightbox.variantIdx] : null;

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6 fade-in-up">
      <div>
        <h2 className="font-heading text-xl font-bold">AI Model Rendering</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          3 Asian model variants will be generated for each jewelry item. Select your favorite for each.
        </p>
      </div>

      {images.map((img) => {
        const variants = models[img.id] || [];
        const selectedId = selections[img.id];
        const jobStatus = getJobStatus(img.id);
        const isFailed = jobStatus?.status === "failed";

        if (isFailed) {
          return (
            <div key={img.id} className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-sm font-medium">{img.name} — Rendering failed</p>
                {onRetry && (
                  <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => onRetry(img.id)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Retry
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{jobStatus?.error_message || "An error occurred during model rendering."}</p>
            </div>
          );
        }

        return (
          <div key={img.id} className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
            <div className="flex flex-col lg:flex-row gap-5">
              <div className="shrink-0 space-y-2">
                <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Enhanced Jewelry</Badge>
                <img src={img.url} alt={img.name} className="w-full lg:w-40 h-48 lg:h-56 rounded-lg object-cover" />
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {variants.map((v, vi) => {
                  const isSelected = selectedId === v.id;
                  return (
                    <div
                      key={v.id}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected ? "border-primary gold-glow" : "border-border/50 hover:border-border"
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}

                      {v.done ? (
                        <div className="group relative">
                          <img src={v.url} alt={`Model variant ${vi + 1}`} className="w-full h-56 object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" className="gap-1.5 gold-glow-hover" onClick={() => handleSelect(img.id, v.id)}>
                              <Check className="h-3.5 w-3.5" /> Select
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLightbox({ imageId: img.id, variantIdx: vi })}>
                              <Maximize2 className="h-3.5 w-3.5" /> Expand
                            </Button>
                          </div>
                          <p className="p-2 text-center text-xs text-muted-foreground">Model {vi + 1}</p>
                        </div>
                      ) : (
                        <div className="flex h-56 flex-col items-center justify-center bg-secondary/50 animate-pulse">
                          {/* Circular progress indicator */}
                          <div className="relative h-14 w-14 mb-3">
                            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                              <circle cx="28" cy="28" r="24" fill="none" strokeWidth="3" className="stroke-border" />
                              <circle
                                cx="28" cy="28" r="24" fill="none" strokeWidth="3"
                                className="stroke-primary"
                                strokeDasharray={`${(v.progress / 100) * 150.8} 150.8`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-heading font-bold text-primary">
                              {v.progress}%
                            </span>
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">Generating…</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {allSelected && (
        <div className="flex justify-end pt-2">
          <Button onClick={onComplete} size="lg" className="gap-2 gold-glow-hover">
            <ZoomIn className="h-4 w-4" /> Generate 4K Zoom Shots →
          </Button>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightbox && lightboxCurrent && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 p-4">
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-50">
            <X className="h-6 w-6" />
          </button>
          <img src={lightboxCurrent.url} alt="Model preview" className="max-h-[65vh] max-w-full rounded-lg object-contain" />
          <Button className="mt-4 gap-2 gold-glow-hover" onClick={() => { handleSelect(lightbox.imageId, lightboxCurrent.id); setLightbox(null); }}>
            <Check className="h-4 w-4" /> Select This Model
          </Button>
          <div className="mt-4 flex gap-3">
            {lightboxVariants.map((v, vi) => (
              <button
                key={v.id}
                onClick={() => setLightbox({ ...lightbox, variantIdx: vi })}
                className={`rounded-lg overflow-hidden border-2 transition-all ${vi === lightbox.variantIdx ? "border-primary gold-glow" : "border-border/50"}`}
              >
                <img src={v.url} alt="" className="h-16 w-16 object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelRenderStage;
