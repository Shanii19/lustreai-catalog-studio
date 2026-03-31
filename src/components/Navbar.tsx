import { useState } from "react";
import { Link } from "react-router-dom";
import { Diamond, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 transition-opacity duration-300 hover:opacity-80">
          <Diamond className="h-5 w-5 text-primary" />
          <span className="font-heading text-xl font-semibold text-primary">LustreAI</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground">
            Features
          </a>
          <Link to="/dashboard" className="text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground">
            Dashboard
          </Link>
        </div>

        {/* Desktop CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/login">Login</Link>
          </Button>
          <Button asChild className="rounded-lg bg-primary text-primary-foreground transition-all duration-300 hover:bg-primary/90 gold-glow-hover">
            <Link to="/signup">Get Started</Link>
          </Button>
        </div>

        {/* Mobile toggle */}
        <button
          className="text-foreground md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border/50 bg-background px-6 pb-6 pt-4 md:hidden fade-in">
          <div className="flex flex-col gap-4">
            <a href="#features" onClick={() => setMobileOpen(false)} className="text-sm text-muted-foreground">Features</a>
            <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="text-sm text-muted-foreground">Dashboard</Link>
            <hr className="border-border/50" />
            <Link to="/login" onClick={() => setMobileOpen(false)} className="text-sm text-muted-foreground">Login</Link>
            <Button asChild className="rounded-lg bg-primary text-primary-foreground">
              <Link to="/signup" onClick={() => setMobileOpen(false)}>Get Started</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
