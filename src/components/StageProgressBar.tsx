import { Check } from "lucide-react";

const stages = ["Upload", "Enhance", "Model Render", "Export"];

interface Props {
  current: number; // 0-based index
}

const StageProgressBar = ({ current }: Props) => (
  <div className="flex items-center justify-center gap-0 px-6 py-5 border-b border-border/50">
    {stages.map((label, i) => {
      const completed = i < current;
      const active = i === current;
      return (
        <div key={label} className="flex items-center">
          {/* Dot */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                completed
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "border-2 border-primary bg-primary/10 text-primary"
                  : "border border-border bg-secondary text-muted-foreground"
              }`}
            >
              {completed ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`text-[11px] font-medium whitespace-nowrap ${
                completed || active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
          {/* Connector line */}
          {i < stages.length - 1 && (
            <div
              className={`mx-3 mt-[-18px] h-0.5 w-12 sm:w-20 transition-colors ${
                i < current ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </div>
      );
    })}
  </div>
);

export default StageProgressBar;
