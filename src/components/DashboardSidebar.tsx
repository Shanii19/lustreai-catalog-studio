import { Diamond, LayoutGrid, FolderOpen, Settings, LogOut } from "lucide-react";
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

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-border/50 bg-[hsl(0_0%_6%)]">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <Diamond className="h-5 w-5 text-primary" />
        <span className="font-heading text-lg font-bold text-primary">LustreAI</span>
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
    </aside>
  );
};

export default DashboardSidebar;
