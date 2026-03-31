import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Key, CreditCard } from "lucide-react";
import SettingsProfile from "@/components/settings/SettingsProfile";
import SettingsApiKeys from "@/components/settings/SettingsApiKeys";
import SettingsBilling from "@/components/settings/SettingsBilling";

const DashboardSettings = () => {
  const [tab, setTab] = useState("profile");

  return (
    <div className="flex-1 overflow-auto px-6 py-6 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, API keys, and billing
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="bg-secondary/50 border border-border/50">
          <TabsTrigger value="profile" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Key className="h-4 w-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <SettingsProfile />
        </TabsContent>
        <TabsContent value="api-keys">
          <SettingsApiKeys />
        </TabsContent>
        <TabsContent value="billing">
          <SettingsBilling />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DashboardSettings;
