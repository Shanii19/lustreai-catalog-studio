import { Outlet } from "react-router-dom";
import DashboardSidebar from "./DashboardSidebar";
import NewProjectModal from "./NewProjectModal";
import { useState } from "react";

const DashboardLayout = () => {
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar />
      <main className="flex-1 flex flex-col min-h-screen">
        <Outlet context={{ openNewProject: () => setNewProjectOpen(true) }} />
      </main>
      <NewProjectModal open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </div>
  );
};

export default DashboardLayout;
