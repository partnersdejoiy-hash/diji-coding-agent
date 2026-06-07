"use client";

import Link from "next/link";
import { Settings, LogOut, Code2, Plus } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";

export function TopBar() {
  const { user, currentWorkspace, logout } = useAppStore();

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-card border-b border-border h-12">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">DEJOIY CodeAgent</span>
        </Link>
        {currentWorkspace && (
          <span className="text-xs text-muted-foreground border-l border-border pl-3">
            {currentWorkspace.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {user && (
          <span className="text-xs text-muted-foreground">{user.name}</span>
        )}
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

export function WorkspaceSelector() {
  const { workspaces, setCurrentWorkspace, loadWorkspaces } = useAppStore();

  const handleCreate = async () => {
    const name = prompt("Workspace name:");
    if (!name) return;
    const { api } = await import("@/lib/api");
    await api.post("/api/workspaces", { name });
    loadWorkspaces();
  };

  return (
    <div className="grid gap-3">
      {workspaces.map((ws) => (
        <Link
          key={ws.id}
          href={`/workspace/${ws.id}`}
          className="block p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
          onClick={() => setCurrentWorkspace(ws)}
        >
          <h3 className="font-medium">{ws.name}</h3>
          {ws.description && (
            <p className="text-sm text-muted-foreground mt-1">{ws.description}</p>
          )}
          <div className="flex gap-2 mt-2">
            {ws.isIndexed && (
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
                Indexed
              </span>
            )}
          </div>
        </Link>
      ))}

      <button
        onClick={handleCreate}
        className="flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
      >
        <Plus className="h-4 w-4" />
        New Workspace
      </button>
    </div>
  );
}
