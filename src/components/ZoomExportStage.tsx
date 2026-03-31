import { useEffect, useState, useCallback } from "react";
import { Download, Check, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface ImageItem {
  id: string;
  url: string;
  name: string;
}

interface ZoomShot {
  id: string;
  url: string;
  angle: string;
  progress: number;
  done: boolean;
}

const ANGLES = ["Front View", "Side Profile", "Top-Down", "Macro Detail"];

const generatePlaceholderUrl = (seed: number) =>
  `https://picsum.photos/seed/${seed}/800/800`;

interface Props {
  images: ImageItem[];
  onComplete: (zoomUrls: string[]) => void;
}

const ZoomExportStage = ({ images, onComplete }: Props) => {
  const [shots, setShots] = useState<Record<string, ZoomShot[]>>({});
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [exporting, setExporting] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Initialize zoom shot generation mock
  useEffect(() => {
    const initial: Record<string, ZoomShot[]> = {};
    images.forEach((img, imgIdx) => {
      initial[img.id] = ANGLES.map((angle, ai) => ({
        id: `${img.id}-zoom-${ai}`,
        url: generatePlaceholderUrl(imgIdx * 200 + ai * 53 + 7),
        angle,
        progress: 0,
        done: false,
      }));
    });
    setShots(initial);

    const timers: NodeJS.Timeout[] = [];
    images.forEach((img, imgIdx) => {
      ANGLES.forEach((_angle, ai) => {
        const baseDelay = (imgIdx * 4 + ai) * 600;
        const duration = 2500 + ai * 800;
        const steps = 20;
        for (let s = 1; s <= steps; s++) {
          const timer = setTimeout(() => {
            setShots((prev) => {
              const arr = [...(prev[img.id] || [])];
              if (arr[ai]) {
                const pct = Math.min(Math.round((s / steps) * 100), 100);
                arr[ai] = { ...arr[ai], progress: pct, done: pct === 100 };
              }
              return { ...prev, [img.id]: arr };
            });
          }, baseDelay + (duration / steps) * s);
          timers.push(timer);
        }
      });
    });

    return () => timers.forEach(clearTimeout);
  }, [images]);

  const allDone = images.length > 0 && images.every((img) =>
    (shots[img.id] || []).every((s) => s.done)
  );

  const totalReady = Object.values(shots).flat().filter((s) => s.done).length;

  const handleDownloadSingle = useCallback(async (url: string, name: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      saveAs(blob, `${name}.${format}`);
    } catch {
      // fallback: open in new tab
      window.open(url, "_blank");
    }
  }, [format]);

  const handleDownloadAll = useCallback(async () => {
    setExporting(true);
    try {
      const zip = new JSZip();
      const allShots = Object.entries(shots).flatMap(([_imgId, arr]) => arr.filter((s) => s.done));
      await Promise.all(
        allShots.map(async (shot) => {
          const resp = await fetch(shot.url);
          const blob = await resp.blob();
          zip.file(`${shot.angle.replace(/\s/g, "_")}_${shot.id}.${format}`, blob);
        })
      );
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `lustreai-export.zip`);
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setExporting(false);
    }
  }, [shots, format]);

  const handleComplete = useCallback(() => {
    const allUrls = Object.values(shots).flatMap((arr) =>
      arr.filter((s) => s.done).map((s) => s.url)
    );
    setCompleted(true);
    onComplete(allUrls);
  }, [shots, onComplete]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden fade-in-up">
      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="font-heading text-xl font-bold">Generating 4K Detail Shots</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-angle close-ups highlighting texture, shine, and craftsmanship
          </p>
        </div>

        {/* Zoom panels */}
        {images.map((img) => {
          const imgShots = shots[img.id] || [];
          return (
            <div key={img.id} className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
              <p className="text-sm font-medium font-heading">{img.name}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {imgShots.map((shot) => (
                  <div
                    key={shot.id}
                    className="group relative rounded-lg overflow-hidden border border-border/50"
                  >
                    {shot.done ? (
                      <>
                        <img
                          src={shot.url}
                          alt={shot.angle}
                          className="w-full aspect-square object-cover"
                        />
                        {/* 4K badge */}
                        <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5">
                          4K
                        </Badge>
                        {/* Angle badge */}
                        <div className="absolute bottom-0 inset-x-0 bg-background/80 px-2 py-1.5 text-center">
                          <span className="text-[11px] font-medium">{shot.angle}</span>
                        </div>
                        {/* Download hover */}
                        <button
                          onClick={() => handleDownloadSingle(shot.url, `${shot.angle}_${shot.id}`)}
                          className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="flex aspect-square flex-col items-center justify-center bg-secondary/50 animate-pulse">
                        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
                        <p className="text-[11px] text-muted-foreground">Generating…</p>
                        <p className="text-sm font-heading font-bold text-primary">{shot.progress}%</p>
                        <span className="mt-1 text-[10px] text-muted-foreground/60">{shot.angle}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sticky export bar */}
      {allDone && !completed && (
        <div className="shrink-0 border-t border-border/50 bg-card px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{totalReady}</span> images ready for export
          </p>

          <div className="flex items-center gap-2">
            {/* Format selector */}
            <div className="flex rounded-md border border-border/50 overflow-hidden text-xs">
              <button
                onClick={() => setFormat("png")}
                className={`px-3 py-1.5 transition-colors ${format === "png" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}
              >
                PNG
              </button>
              <button
                onClick={() => setFormat("jpeg")}
                className={`px-3 py-1.5 transition-colors ${format === "jpeg" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"}`}
              >
                JPEG
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadAll}
              disabled={exporting}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Zipping…" : "Download All as ZIP"}
            </Button>

            <Button size="sm" onClick={handleComplete} className="gap-1.5 gold-glow-hover">
              <Check className="h-3.5 w-3.5" /> Finish & Complete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoomExportStage;
