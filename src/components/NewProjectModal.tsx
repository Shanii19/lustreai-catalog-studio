import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NewProjectModal = ({ open, onOpenChange }: Props) => {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: name.trim(), user_id: user.id })
      .select()
      .single();

    setLoading(false);
    if (error) {
      toast.error("Failed to create project");
      return;
    }
    onOpenChange(false);
    setName("");
    toast.success("Project created");
    navigate(`/project/${data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-heading">New Project</DialogTitle>
          <DialogDescription>Give your jewelry project a name to get started.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="e.g. Spring Collection 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-secondary border-border focus-visible:ring-primary"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || loading} className="gold-glow-hover">
            {loading ? "Creating…" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewProjectModal;
