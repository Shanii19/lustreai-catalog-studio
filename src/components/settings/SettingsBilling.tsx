import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// TODO: Integrate Stripe checkout here
const PLANS = [
  {
    name: "Starter",
    price: 29,
    images: 100,
    features: ["100 images/month", "AI enhancement", "Model rendering", "4K zoom shots", "Email support"],
  },
  {
    name: "Professional",
    price: 79,
    images: 500,
    popular: true,
    features: ["500 images/month", "Priority AI processing", "Custom API keys", "Bulk export", "Priority support"],
  },
  {
    name: "Agency",
    price: 199,
    images: -1,
    features: ["Unlimited images", "Dedicated processing", "White-label export", "Team accounts", "Dedicated support"],
  },
];

const FREE_LIMIT = 10;

const SettingsBilling = () => {
  const { user } = useAuth();
  const [usage, setUsage] = useState({ images_enhanced: 0, models_generated: 0, zoom_shots_generated: 0 });

  useEffect(() => {
    if (!user) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    supabase
      .from("monthly_usage")
      .select("images_enhanced, models_generated, zoom_shots_generated")
      .eq("user_id", user.id)
      .eq("month", currentMonth)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setUsage(data);
      });
  }, [user]);

  const totalUsed = usage.images_enhanced;
  const usagePct = Math.min((totalUsed / FREE_LIMIT) * 100, 100);

  return (
    <div className="space-y-8">
      {/* Current Plan */}
      <div className="rounded-xl border border-border/50 bg-card p-6 space-y-4 max-w-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-bold text-lg">Free Plan</h3>
            <p className="text-sm text-muted-foreground">
              {FREE_LIMIT} images/month
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">Current</Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Usage this month</span>
            <span className="font-heading font-bold text-primary">
              {totalUsed} of {FREE_LIMIT}
            </span>
          </div>
          <Progress
            value={usagePct}
            className="h-2.5 [&>div]:bg-primary"
          />
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-lg bg-secondary/50 p-3 text-center">
            <p className="text-lg font-heading font-bold text-foreground">{usage.images_enhanced}</p>
            <p className="text-[10px] text-muted-foreground">Enhanced</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3 text-center">
            <p className="text-lg font-heading font-bold text-foreground">{usage.models_generated}</p>
            <p className="text-[10px] text-muted-foreground">Models</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-3 text-center">
            <p className="text-lg font-heading font-bold text-foreground">{usage.zoom_shots_generated}</p>
            <p className="text-[10px] text-muted-foreground">Zoom Shots</p>
          </div>
        </div>
      </div>

      {/* Upgrade Plans */}
      <div>
        <h3 className="font-heading font-bold text-lg mb-4">Upgrade Your Plan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-xl border bg-card p-5 space-y-4 ${
                plan.popular
                  ? "border-primary shadow-[0_0_20px_-5px_hsl(var(--primary)/0.3)]"
                  : "border-border/50"
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] gap-1">
                  <Sparkles className="h-3 w-3" /> Most Popular
                </Badge>
              )}
              <div>
                <h4 className="font-heading font-bold">{plan.name}</h4>
                <div className="mt-1">
                  <span className="text-3xl font-heading font-bold text-primary">${plan.price}</span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {plan.images === -1 ? "Unlimited images" : `${plan.images} images/month`}
                </p>
              </div>

              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* TODO: Integrate Stripe checkout here */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    size="sm"
                    disabled
                  >
                    Upgrade
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming Soon</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsBilling;
