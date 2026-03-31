import { useEffect, useState, useCallback } from "react";
import { Check, Maximize2, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
}

const generatePlaceholderUrl = (seed: number) =>
  `https://picsum.photos/seed/${seed}/400/600`;

const ModelRenderStage = ({ images, onComplete }: Props) => {
  // Map of image id -> 3 model variants
  const [models, setModels] = useState<Record<string, ModelVariant[]>>({});
  // Map of image id -> selected model variant id
  const [selections, setSelections] = useState<Record<string, string>>({});
  // Lightbox state
  const [lightbox, setLightbox] = useState<{ imageId: string; variantIdx: number } | null>(null);

  // Initialize model generation mock
  useEffect(() => {
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

    // Animate progress for each variant
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
  }, [images]);

  const handleSelect = useCallback((imageId: string, variantId: string) => {
    setSelections((prev) => ({ ...prev, [imageId]: variantId }));
  }, []);

  const allSelected = images.length > 0 && images.every((img) => selections[img.id]);

  // Lightbox helpers
  const lightboxVariants = lightbox ? models[lightbox.imageId] : [];
  const lightboxCurrent = lightbox ? lightboxVariants?.[lightbox.variantIdx] : null;

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6 fade-in-up">
      {/* Header */}
      <div>
        <h2 className="font-heading text-xl font-bold">AI Model Rendering</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          3 Asian model variants will be generated for each jewelry item. Select your favorite for each.
        </p>
      </div>

      {/* Rendering panels */}
      {images.map((img) => {
        const variants = models[img.id] || [];
        const selectedId = selections[img.id];

        return (
          <div key={img.id} className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
            <div className="flex flex-col lg:flex-row gap-5">
              {/* Enhanced jewelry thumbnail */}
              <div className="shrink-0 space-y-2">
                <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
                  Enhanced Jewelry
                </Badge>
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full lg:w-40 h-48 lg:h-56 rounded-lg object-cover"
                />
              </div>

              {/* 3-column model grid */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {variants.map((v, vi) => {
                  const isSelected = selectedId === v.id;

                  return (
                    <div
                      key={v.id}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? "border-primary gold-glow"
                          : "border-border/50 hover:border-border"
                      }`}
                    >
                      {/* Selected badge */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}

                      {v.done ? (
                        /* Completed model image with hover overlay */
                        <div className="group relative">
                          <img
                            src={v.url}
                            alt={`Model variant ${vi + 1}`}
                            className="w-full h-56 object-cover"
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="sm"
                              className="gap-1.5 gold-glow-hover"
                              onClick={() => handleSelect(img.id, v.id)}
                            >
                              <Check className="h-3.5 w-3.5" /> Select
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => setLightbox({ imageId: img.id, variantIdx: vi })}
                            >
                              <Maximize2 className="h-3.5 w-3.5" /> Expand
                            </Button>
                          </div>
                          <p className="p-2 text-center text-xs text-muted-foreground">
                            Model {vi + 1}
                          </p>
                        </div>
                      ) : (
                        /* Generating skeleton */
                        <div className="flex h-56 flex-col items-center justify-center bg-secondary/50 animate-pulse">
                          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin mb-3" />
                          <p className="text-xs font-medium text-muted-foreground">Generating Model…</p>
                          <p className="mt-1 text-lg font-heading font-bold text-primary">{v.progress}%</p>
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

      {/* CTA */}
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
          {/* Close */}
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-50"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Main image */}
          <img
            src={lightboxCurrent.url}
            alt="Model preview"
            className="max-h-[65vh] max-w-full rounded-lg object-contain"
          />

          {/* Select button */}
          <Button
            className="mt-4 gap-2 gold-glow-hover"
            onClick={() => {
              handleSelect(lightbox.imageId, lightboxCurrent.id);
              setLightbox(null);
            }}
          >
            <Check className="h-4 w-4" /> Select This Model
          </Button>

          {/* Thumbnail row */}
          <div className="mt-4 flex gap-3">
            {lightboxVariants.map((v, vi) => (
              <button
                key={v.id}
                onClick={() => setLightbox({ ...lightbox, variantIdx: vi })}
                className={`rounded-lg overflow-hidden border-2 transition-all ${
                  vi === lightbox.variantIdx ? "border-primary gold-glow" : "border-border/50"
                }`}
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
