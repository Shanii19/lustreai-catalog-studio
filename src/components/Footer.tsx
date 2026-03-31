import { Diamond } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t border-border/50 bg-background">
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
        <Link to="/" className="flex items-center gap-2">
          <Diamond className="h-4 w-4 text-primary" />
          <span className="font-heading text-lg font-semibold text-primary">LustreAI</span>
        </Link>

        <div className="flex gap-6">
          <a href="#features" className="text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground">Features</a>
          <Link to="/login" className="text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground">Login</Link>
          <Link to="/signup" className="text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground">Sign Up</Link>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} LustreAI. All rights reserved.
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
