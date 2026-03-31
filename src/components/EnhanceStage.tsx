import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ImageItem {
  id: string;
  url: string;
  name: string;
}

interface Props {
  images: ImageItem[];
  onComplete: () => void;
}

const EnhanceStage = ({ images, onComplete }: Props) => {
  const [enhanced, setEnhanced] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Mock: enhance each image with a staggered 3s delay
    images.forEach((img, i) => {
      const timer = setTimeout(() => {
        setEnhanced((prev) => new Set(prev).add(img.id));
      }, 3000 + i * 1500);
      return () => clearTimeout(timer);
    });
  }, [images]);

  const allDone = enhanced.size === images.length;

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
          const done = enhanced.has(img.id);
          return (
            <div key={img.id} className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border/50 bg-card p-4">
              {/* Original */}
              <div className="space-y-2">
                <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Original</Badge>
                <img src={img.url} alt={img.name} className="w-full rounded-lg object-cover max-h-64" />
              </div>
              {/* Enhanced */}
              <div className="space-y-2">
                {done ? (
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
    </div>
  );
};

export default EnhanceStage;
