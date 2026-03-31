import { Link } from "react-router-dom";
import { Plus, Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";

const Dashboard = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <main className="mx-auto max-w-7xl px-6 pt-24 pb-16 fade-in-up">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your jewelry visualization projects</p>
        </div>
        <Button className="gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 gold-glow-hover">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card py-24">
        <Diamond className="mb-4 h-10 w-10 text-muted-foreground/40" />
        <p className="mb-1 font-heading text-lg font-semibold text-muted-foreground">No projects yet</p>
        <p className="mb-6 text-sm text-muted-foreground/60">Create your first project to get started</p>
        <Button className="gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Create Project
        </Button>
      </div>
    </main>
  </div>
);

export default Dashboard;
