"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { TopBar, WorkspaceSelector } from "@/components/layout/top-bar";
import { api } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const { user, token, setUser, setToken, loadWorkspaces, workspaces } = useAppStore();

  useEffect(() => {
    const savedToken = localStorage.getItem("token");
    if (savedToken) {
      api.setToken(savedToken);
      setToken(savedToken);
      api
        .get<{ user: typeof user }>("/api/auth/me")
        .then((res) => {
          setUser(res.user);
          loadWorkspaces();
        })
        .catch(() => {
          setToken(null);
          router.push("/login");
        });
    } else {
      router.push("/login");
    }
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Your Workspaces</h1>
        <p className="text-muted-foreground mb-6">
          Select a workspace or create a new one to start coding with AI.
        </p>
        <WorkspaceSelector />
      </main>
    </div>
  );
}
