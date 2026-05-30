import { useEffect, useState, useCallback } from "react";
import { Loader2, CheckCircle2, AlertCircle, RotateCcw, Timer } from "lucide-react";
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

function isFallbackComplete(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  return errorMessage.toLowerCase().includes('source_passthrough');
}

const RATE_LIMIT_COOLDOWN = 60; // seconds

function isRateLimited(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return lower.includes('rate_limited') || lower.includes('rate limit') || lower.includes('429');
}

function isCreditsExhausted(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return lower.includes('credits_exhausted') || lower.includes('billing hard limit') || lower.includes('billing_hard_limit_reached') || lower.includes('insufficient_quota');
}

function CooldownTimer({ seconds, onComplete, onRetry, imageId }: { seconds: number; onComplete: () => void; onRetry?: (id: string) => void; imageId: string }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete();
      if (onRetry) onRetry(imageId);
      return;
    }
    const timer = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onComplete, onRetry, imageId]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progressPercent = ((seconds - remaining) / seconds) * 100;

  return (
    <div className="flex flex-col items-center gap-3 text-center px-4">
      <div className="relative h-16 w-16 flex items-center justify-center">
        <svg className="absolute inset-0 h-16 w-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
          <circle
            cx="32" cy="32" r="28" fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 28}`}
            strokeDashoffset={`${2 * Math.PI * 28 * (1 - progressPercent / 100)}`}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
        </svg>
        <Timer className="h-5 w-5 text-primary" />
      </div>
      <div>
        <span className="text-lg font-heading font-bold text-primary tabular-nums">
          {mins}:{secs.toString().padStart(2, '0')}
        </span>
        <p className="text-xs text-muted-foreground mt-1">Rate limit cooldown — auto-retrying…</p>
      </div>
      <Progress value={progressPercent} className="h-1.5 w-32 [&>div]:bg-primary" />
    </div>
  );
}

const EnhanceStage = ({ images, onComplete, jobs, onRetry }: Props) => {
  const [mockEnhanced, setMockEnhanced] = useState<Set<string>>(new Set());
  const [cooldowns, setCooldowns] = useState<Set<string>>(new Set());

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
        fallback: isFallbackComplete(job.error_message),
      };
    }
    return { done: mockEnhanced.has(imageId), failed: false, progress: mockEnhanced.has(imageId) ? 100 : 0, fallback: false };
  };

  const handleCooldownComplete = useCallback((imageId: string) => {
    setCooldowns(prev => {
      const next = new Set(prev);
      next.delete(imageId);
      return next;
    });
  }, []);

  const handleStartCooldown = useCallback((imageId: string) => {
    setCooldowns(prev => new Set(prev).add(imageId));
  }, []);

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
          const rateLimited = status.failed && isRateLimited(status.errorMessage);
          const creditsExhausted = status.failed && isCreditsExhausted(status.errorMessage);
          const inCooldown = cooldowns.has(img.id);

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
                  rateLimited && inCooldown ? (
                    <>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-400">
                        <Timer className="h-3 w-3 mr-1" /> Rate Limited
                      </Badge>
                      <div className="w-full rounded-lg border-2 border-amber-500/30 bg-amber-500/5 max-h-64 h-48 flex items-center justify-center">
                        <CooldownTimer
                          seconds={RATE_LIMIT_COOLDOWN}
                          onComplete={() => handleCooldownComplete(img.id)}
                          onRetry={onRetry}
                          imageId={img.id}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="text-[10px] bg-destructive/20 text-destructive">Failed</Badge>
                      <div className="w-full rounded-lg border-2 border-destructive/30 bg-destructive/5 max-h-64 h-48 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-center px-4">
                          <AlertCircle className="h-8 w-8 text-destructive" />
                          <span className="text-sm text-destructive">
                            {creditsExhausted
                              ? "Enhancement provider credits are exhausted. Update an active enhancement key or restore provider credits, then retry."
                              : rateLimited
                              ? "All providers are rate limited. Waiting for cooldown…"
                              : (status.errorMessage || "Enhancement failed")}
                          </span>
                          {rateLimited ? (
                            <Button size="sm" variant="outline" className="mt-2 gap-1.5 border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={() => handleStartCooldown(img.id)}>
                              <Timer className="h-3.5 w-3.5" /> Start 60s Cooldown & Auto-Retry
                            </Button>
                          ) : onRetry ? (
                            <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={() => onRetry(img.id)}>
                              <RotateCcw className="h-3.5 w-3.5" /> Retry
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </>
                  )
                ) : status.done ? (
                  <>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-400">
                      {status.fallback ? "Ready ✓" : "Enhanced ✓"}
                    </Badge>
                    <img src={img.url} alt={`Enhanced ${img.name}`} className="w-full rounded-lg object-cover max-h-64 brightness-110 contrast-105 saturate-110" />
                    {status.fallback && (
                      <p className="text-xs text-muted-foreground">External enhancement was unavailable, so this image will continue with the cleaned source version.</p>
                    )}
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
          {failedImages.length} image(s) failed. {failedImages.some(img => isRateLimited(getStatus(img.id).errorMessage)) && "Rate-limited images can auto-retry after cooldown."}
        </p>
      )}
    </div>
  );
};

export default EnhanceStage;
