"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/top-bar";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "o1",
  "o1-mini",
  "o3-mini",
];

export default function SettingsPage() {
  const router = useRouter();
  const { token } = useAppStore();
  const [settings, setSettings] = useState({
    openaiApiKey: "",
    model: "gpt-4o",
    temperature: 0.7,
    maxTokens: 4096,
    autonomyLevel: 3,
    hasApiKey: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    api
      .get<{ settings: typeof settings | null }>("/api/settings")
      .then((res) => {
        if (res.settings) setSettings((s) => ({ ...s, ...res.settings! }));
      })
      .catch(() => {});
  }, [token]);

  const handleSave = async () => {
    await api.put("/api/settings", {
      openaiApiKey: settings.openaiApiKey || undefined,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      autonomyLevel: settings.autonomyLevel,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium">OpenAI API Key</label>
            <Input
              type="password"
              placeholder={settings.hasApiKey ? "••••••••••••" : "sk-..."}
              value={settings.openaiApiKey}
              onChange={(e) =>
                setSettings({ ...settings, openaiApiKey: e.target.value })
              }
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Your API key is stored securely and never exposed to the client.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Model</label>
            <select
              className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">
              Temperature: {settings.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(e) =>
                setSettings({ ...settings, temperature: parseFloat(e.target.value) })
              }
              className="w-full mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Max Tokens</label>
            <Input
              type="number"
              value={settings.maxTokens}
              onChange={(e) =>
                setSettings({ ...settings, maxTokens: parseInt(e.target.value) })
              }
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Agent Autonomy Level: {settings.autonomyLevel}
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={settings.autonomyLevel}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  autonomyLevel: parseInt(e.target.value),
                })
              }
              className="w-full mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Higher levels allow more autonomous steps (1=5 steps, 5=50 steps)
            </p>
          </div>

          <Button onClick={handleSave} className="w-full">
            {saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>
      </main>
    </div>
  );
}
