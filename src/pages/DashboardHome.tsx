import { useEffect, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { Plus, TrendingUp, Layers, ImagePlus, Sparkles, Diamond, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects">;
type ProjectWithThumb = Project & { thumbnail?: string };

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  processing: "bg-amber-500/20 text-amber-400",
  complete: "bg-emerald-500/20 text-emerald-400",
};

const DashboardHome = () => {
  const { openNewProject } = useOutletContext<{ openNewProject: () => void }>();
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithThumb[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(async ({ data }) => {
        const projs: ProjectWithThumb[] = data ?? [];
        // Fetch first image for each project as thumbnail
        for (const p of projs) {
          const { data: imgs } = await supabase
            .from("project_images")
            .select("storage_url")
            .eq("project_id", p.id)
            .order("created_at", { ascending: false })
            .limit(1);
          if (imgs && imgs.length > 0) {
            p.thumbnail = imgs[0].storage_url;
          }
        }
        setProjects(projs);
        setLoading(false);
      });
  }, [user]);

  const stats = [
    { label: "Total Projects", value: projects.length, icon: Layers },
    { label: "Images Enhanced", value: 0, icon: Sparkles },
    { label: "Images Generated", value: 0, icon: ImagePlus },
  ];

  return (
    <>
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <h1 className="font-heading text-xl font-bold">Dashboard</h1>
        <Button onClick={openNewProject} className="gap-2 gold-glow-hover">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6 space-y-8 fade-in-up">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border/50 bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-heading font-bold text-primary">{s.value}</span>
                <s.icon className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Projects */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-semibold">Recent Projects</h2>
            {projects.length > 0 && (
              <Link to="/dashboard/projects" className="text-sm text-primary hover:underline">View all</Link>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-52 rounded-xl border border-border/50 bg-card animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card py-20">
              <Diamond className="mb-4 h-10 w-10 text-muted-foreground/30" />
              <p className="mb-1 font-heading text-lg font-semibold text-muted-foreground">Your first project awaits</p>
              <p className="mb-6 text-sm text-muted-foreground/60">Create a project to start enhancing your jewelry images</p>
              <Button onClick={openNewProject} className="gap-2 gold-glow-hover">
                <Plus className="h-4 w-4" /> Create Project
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((p) => (
                <div key={p.id} className="group rounded-xl border border-border/50 bg-card overflow-hidden transition-all hover:border-primary/30">
                  <div className="h-32 bg-secondary/50 flex items-center justify-center">
                    <Diamond className="h-8 w-8 text-muted-foreground/20" />
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-heading font-semibold text-sm truncate">{p.name}</h3>
                      <Badge variant="outline" className={`text-[10px] capitalize ${statusColor[p.status] ?? statusColor.draft}`}>
                        {p.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</p>
                    <Button asChild size="sm" variant="outline" className="w-full mt-1 hover:border-primary/50 hover:text-primary">
                      <Link to={`/project/${p.id}`}>Open</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
};

export default DashboardHome;
