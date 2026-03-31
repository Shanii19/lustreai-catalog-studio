import { Link } from "react-router-dom";
import { Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Signup = () => (
  <div className="flex min-h-screen items-center justify-center bg-background px-6">
    <div className="w-full max-w-sm fade-in-up">
      <div className="mb-8 text-center">
        <Link to="/" className="mb-6 inline-flex items-center gap-2">
          <Diamond className="h-5 w-5 text-primary" />
          <span className="font-heading text-xl font-semibold text-primary">LustreAI</span>
        </Link>
        <h1 className="font-heading text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Start your free trial — no credit card required</p>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" placeholder="Jane Doe" className="rounded-sm border-border bg-card" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" className="rounded-sm border-border bg-card" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="••••••••" className="rounded-sm border-border bg-card" />
        </div>
        <Button type="submit" className="w-full rounded-lg bg-primary text-primary-foreground transition-all duration-300 hover:bg-primary/90 gold-glow-hover">
          Start Free Trial
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="text-primary transition-colors hover:underline">Sign in</Link>
      </p>
    </div>
  </div>
);

export default Signup;
