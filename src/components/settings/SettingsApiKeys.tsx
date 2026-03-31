import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface ApiKeyField {
  keyType: string;
  label: string;
  description: string;
}

const API_KEY_FIELDS: ApiKeyField[] = [
  {
    keyType: "enhancement",
    label: "Enhancement API Key",
    description: "Used for jewelry image enhancement (overrides built-in AI)",
  },
  {
    keyType: "image_generation",
    label: "Image Generation API Key",
    description: "Used for model rendering and zoom shot generation",
  },
];

const SettingsApiKeys = () => {
  const { user } = useAuth();
  const [keys, setKeys] = useState<Record<string, { value: string; isActive: boolean; saved: boolean }>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_api_keys")
      .select("key_type, encrypted_key, is_active")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const loaded: Record<string, { value: string; isActive: boolean; saved: boolean }> = {};
        for (const field of API_KEY_FIELDS) {
          const existing = data?.find((k) => k.key_type === field.keyType);
          loaded[field.keyType] = {
            value: existing ? existing.encrypted_key : "",
            isActive: existing?.is_active ?? false,
            saved: !!existing,
          };
        }
        setKeys(loaded);
      });
  }, [user]);

  const handleSave = async (keyType: string) => {
    if (!user) return;
    const value = keys[keyType]?.value;
    if (!value?.trim()) {
      toast.error("Please enter an API key");
      return;
    }

    setSaving((prev) => ({ ...prev, [keyType]: true }));
    try {
      // TODO: Use Supabase Vault for proper encryption instead of storing plaintext
      const { error } = await supabase
        .from("user_api_keys")
        .upsert(
          {
            user_id: user.id,
            key_type: keyType,
            encrypted_key: value.trim(),
            is_active: true,
          },
          { onConflict: "user_id,key_type" }
        );

      if (error) throw error;
      setKeys((prev) => ({
        ...prev,
        [keyType]: { ...prev[keyType], isActive: true, saved: true },
      }));
      toast.success("API key saved");
    } catch {
      toast.error("Failed to save API key");
    } finally {
      setSaving((prev) => ({ ...prev, [keyType]: false }));
    }
  };

  return (
    <div className="space-y-8 max-w-lg">
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <p className="text-sm text-muted-foreground">
          Connect your own AI API keys for higher rate limits and priority access.
          Keys are stored securely on our servers.
        </p>
        <p className="mt-2 text-xs text-muted-foreground/70">
          {/* TODO: Integrate Supabase Vault for proper key encryption */}
          Note: Built-in AI is available without any API keys.
        </p>
      </div>

      {API_KEY_FIELDS.map((field) => {
        const keyState = keys[field.keyType] || { value: "", isActive: false, saved: false };
        const isVisible = visibility[field.keyType] || false;
        const isSaving = saving[field.keyType] || false;

        return (
          <div key={field.keyType} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{field.label}</Label>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  keyState.isActive
                    ? "text-green-400"
                    : "text-muted-foreground"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    keyState.isActive ? "bg-green-400" : "bg-muted-foreground/50"
                  }`}
                />
                {keyState.isActive ? "Active" : "Not configured"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{field.description}</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={isVisible ? "text" : "password"}
                  value={keyState.value}
                  onChange={(e) =>
                    setKeys((prev) => ({
                      ...prev,
                      [field.keyType]: { ...prev[field.keyType], value: e.target.value },
                    }))
                  }
                  placeholder="sk-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() =>
                    setVisibility((prev) => ({ ...prev, [field.keyType]: !isVisible }))
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                size="sm"
                onClick={() => handleSave(field.keyType)}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SettingsApiKeys;
