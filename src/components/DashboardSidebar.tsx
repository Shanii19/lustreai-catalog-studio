import { useState } from "react";
import { Diamond, LayoutGrid, FolderOpen, Settings, LogOut, Menu, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Dashboard", icon: LayoutGrid, to: "/dashboard" },
  { label: "Projects", icon: FolderOpen, to: "/dashboard/projects" },
  { label: "Settings", icon: Settings, to: "/dashboard/settings" },
];

const DashboardSidebar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const displayName = user?.user_metadata?.full_name || user?.email || "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <Diamond className="h-5 w-5 text-primary" />
          <span className="font-heading text-lg font-bold text-primary">LustreAI</span>
        </div>
        {/* Mobile close button */}
        <button
          className="md:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeClassName="bg-secondary text-foreground border-l-2 border-primary font-medium"
            onClick={() => setMobileOpen(false)}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-border/50 p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-secondary text-xs text-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-card border border-border/50 text-foreground"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-60 flex flex-col border-r border-border/50 bg-[hsl(0_0%_6%)] transform transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border/50 bg-[hsl(0_0%_6%)]">
        {sidebarContent}
      </aside>
    </>
  );
};

export default DashboardSidebar;
