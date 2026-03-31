import { Link } from "react-router-dom";
import { Sparkles, User, ZoomIn, RotateCcw, FileImage, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const features = [
  { icon: Sparkles, title: "AI Enhancement", description: "Instantly enhance lighting, color, and clarity of raw jewelry photos using advanced AI models." },
  { icon: User, title: "Model Rendering", description: "Generate photorealistic on-model shots from product images — no photoshoot needed." },
  { icon: ZoomIn, title: "4K Zoom Shots", description: "Create ultra-sharp 4K close-up detail shots that highlight craftsmanship and gemstones." },
  { icon: RotateCcw, title: "Multi-angle Views", description: "Produce consistent multi-angle product views from a single reference image." },
  { icon: FileImage, title: "PNG Export", description: "Export catalog-ready images with transparent backgrounds in high-resolution PNG." },
  { icon: Cloud, title: "Cloud Storage", description: "Securely store and organize all your assets in the cloud with instant CDN delivery." },
];

const Index = () => (
  <div className="min-h-screen bg-background">
    <Navbar />

    {/* Hero */}
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-16">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center fade-in-up">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-primary">AI-Powered Jewelry Visualization</p>
        <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          Turn Raw Jewelry Photos Into Catalog-Ready Visuals — <span className="text-primary">Instantly</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          From AI model rendering to 4K zoom shots, generate stunning e-commerce visuals without expensive photoshoots.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild size="lg" className="rounded-lg bg-primary px-8 text-primary-foreground transition-all duration-300 hover:bg-primary/90 gold-glow-hover">
            <Link to="/signup">Start Free Trial</Link>
          </Button>
          <Button variant="ghost" asChild size="lg" className="text-muted-foreground hover:text-foreground">
            <a href="#features">See Examples ↓</a>
          </Button>
        </div>
      </div>
    </section>

    {/* Features */}
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center fade-in">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-primary">Features</p>
          <h2 className="font-heading text-3xl font-bold sm:text-4xl">Everything You Need to Sell More</h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border/50 bg-card p-8 transition-all duration-300 hover:border-primary/30 gold-glow-hover fade-in-up"
              style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mb-2 font-heading text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    <Footer />
  </div>
);

export default Index;
