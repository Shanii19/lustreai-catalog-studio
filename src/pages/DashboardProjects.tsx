import { useEffect, useState, useMemo, useCallback } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { Plus, Search, Diamond, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects">;

const statusColor: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  processing: "bg-amber-500/20 text-amber-400",
  complete: "bg-emerald-500/20 text-emerald-400",
};

const DashboardProjects = () => {
  const { openNewProject } = useOutletContext<{ openNewProject: () => void }>();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [newName, setNewName] = useState("");

  const fetchProjects = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setProjects(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, [user]);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => projects.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchFilter = filter === "all" || p.status === filter;
    return matchSearch && matchFilter;
  }), [projects, debouncedSearch, filter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("projects").delete().eq("id", deleteTarget.id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Project deleted");
    setDeleteTarget(null);
    fetchProjects();
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    const { error } = await supabase.from("projects").update({ name: newName.trim() }).eq("id", renameTarget.id);
    if (error) { toast.error("Failed to rename"); return; }
    toast.success("Project renamed");
    setRenameTarget(null);
    setNewName("");
    fetchProjects();
  };

  return (
    <>
      <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <h1 className="font-heading text-xl font-bold">Projects</h1>
        <Button onClick={openNewProject} className="gap-2 gold-glow-hover">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6 space-y-6 page-enter">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-secondary border-border" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-52 rounded-xl border border-border/50 skeleton-shimmer" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-card py-20">
            <Diamond className="mb-4 h-10 w-10 text-muted-foreground/30" />
            <p className="mb-1 font-heading text-lg font-semibold text-muted-foreground">No projects found</p>
            <p className="mb-6 text-sm text-muted-foreground/60">{search || filter !== "all" ? "Try adjusting your filters" : "Create your first project to get started"}</p>
            {!search && filter === "all" && (
              <Button onClick={openNewProject} className="gap-2 gold-glow-hover"><Plus className="h-4 w-4" /> Create Project</Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <div key={p.id} className="group rounded-xl border border-border/50 bg-card overflow-hidden transition-all hover:border-primary/30 stagger-card">
                <div className="h-32 bg-secondary/50 flex items-center justify-center">
                  <Diamond className="h-8 w-8 text-muted-foreground/20" />
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-semibold text-sm truncate flex-1">{p.name}</h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setRenameTarget(p); setNewName(p.name); }}>
                          <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] capitalize ${statusColor[p.status] ?? statusColor.draft}`}>{p.status}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  <Button asChild size="sm" variant="outline" className="w-full mt-1 hover:border-primary/50 hover:text-primary">
                    <Link to={`/project/${p.id}`}>Open</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium text-foreground">{deleteTarget?.name}</span> and all its images. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading">Rename Project</DialogTitle>
          </DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-secondary border-border" onKeyDown={(e) => e.key === "Enter" && handleRename()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardProjects;
