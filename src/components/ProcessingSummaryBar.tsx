import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { JobType } from "@/hooks/useProcessingStatus";

interface Summary {
  total: number;
  complete: number;
  processing: number;
  failed: number;
  queued: number;
}

interface Props {
  summary: Summary;
  jobType: JobType;
}

const LABELS: Record<JobType, string> = {
  enhance: "enhanced",
  model_render: "rendered",
  zoom: "generated",
};

const ProcessingSummaryBar = ({ summary, jobType }: Props) => {
  if (summary.total === 0) return null;

  const label = LABELS[jobType];

  return (
    <div className="flex items-center gap-4 px-6 py-2 border-b border-border/50 bg-card/50 text-xs">
      <span className="flex items-center gap-1.5 text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {summary.complete} of {summary.total} {label}
      </span>
      {summary.processing + summary.queued > 0 && (
        <span className="flex items-center gap-1.5 text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {summary.processing + summary.queued} processing
        </span>
      )}
      {summary.failed > 0 && (
        <span className="flex items-center gap-1.5 text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {summary.failed} failed
        </span>
      )}
    </div>
  );
};

export default ProcessingSummaryBar;
