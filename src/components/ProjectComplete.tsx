import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  imageCount: number;
  projectName: string;
}

const ProjectComplete = ({ imageCount, projectName }: Props) => {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12">
      <div className={`flex flex-col items-center text-center max-w-md transition-all duration-700 ${show ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
        {/* Gold animated checkmark */}
        <div className="relative mb-6">
          <div className="h-20 w-20 rounded-full border-4 border-primary flex items-center justify-center gold-glow">
            <Check className="h-10 w-10 text-primary" strokeWidth={3} />
          </div>
          <div className="absolute inset-0 h-20 w-20 rounded-full border-4 border-primary/30 animate-ping" />
        </div>

        <h2 className="font-heading text-2xl font-bold mb-2">Your Catalog Is Ready</h2>
        <p className="text-muted-foreground text-sm mb-6">
          <span className="font-semibold text-foreground">{projectName}</span> — {imageCount} images enhanced,
          rendered with AI models, and exported in 4K resolution.
        </p>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
          <Button
            onClick={() => navigate("/dashboard")}
            className="gap-2 gold-glow-hover"
          >
            <Plus className="h-4 w-4" /> Start New Project
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProjectComplete;
