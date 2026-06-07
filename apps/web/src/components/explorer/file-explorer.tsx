"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { cn, getLanguageFromPath } from "@/lib/utils";
import { api, FileNode } from "@/lib/api";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";

function FileTreeNode({
  node,
  depth = 0,
  onSelect,
  selectedPath,
}: {
  node: FileNode;
  depth?: number;
  onSelect: (node: FileNode) => void;
  selectedPath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (node.isDirectory) {
    return (
      <div>
        <button
          className={cn(
            "flex items-center gap-1 w-full px-2 py-0.5 text-sm hover:bg-accent rounded-sm text-left",
            selectedPath === node.path && "bg-accent"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      className={cn(
        "flex items-center gap-1.5 w-full px-2 py-0.5 text-sm hover:bg-accent rounded-sm text-left",
        selectedPath === node.path && "bg-accent"
      )}
      style={{ paddingLeft: `${depth * 12 + 24}px` }}
      onClick={() => onSelect(node)}
    >
      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileExplorer() {
  const {
    fileTree,
    currentWorkspace,
    activeTab,
    loadFileTree,
    openFile,
  } = useAppStore();
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);

  const handleSelect = async (node: FileNode) => {
    if (node.isDirectory || !currentWorkspace) return;
    try {
      const res = await api.get<{ content: string }>(
        `/api/workspaces/${currentWorkspace.id}/files/file/${node.path}`
      );
      openFile(node.path, res.content, getLanguageFromPath(node.path));
    } catch {
      // File read error
    }
  };

  const handleCreateFile = async () => {
    if (!currentWorkspace || !newFileName.trim()) return;
    await api.post(`/api/workspaces/${currentWorkspace.id}/files/file`, {
      path: newFileName,
      content: "",
    });
    setNewFileName("");
    setShowNewFile(false);
    loadFileTree();
  };

  const handleCreateFolder = async () => {
    if (!currentWorkspace) return;
    const name = prompt("Folder name:");
    if (!name) return;
    await api.post(`/api/workspaces/${currentWorkspace.id}/files/directory`, {
      path: name,
    });
    loadFileTree();
  };

  const handleDelete = async () => {
    if (!currentWorkspace || !activeTab) return;
    if (!confirm(`Delete ${activeTab}?`)) return;
    await api.delete(
      `/api/workspaces/${currentWorkspace.id}/files/file/${activeTab}`
    );
    loadFileTree();
  };

  return (
    <div className="flex flex-col h-full bg-card border-r border-border">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Explorer
        </span>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowNewFile(true)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCreateFolder}>
            <Folder className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadFileTree}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showNewFile && (
        <div className="px-2 py-2 border-b border-border flex gap-1">
          <input
            className="flex-1 bg-muted rounded px-2 py-1 text-xs"
            placeholder="filename.ts"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleCreateFile}>
            Create
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {fileTree.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            onSelect={handleSelect}
            selectedPath={activeTab}
          />
        ))}
        {fileTree.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-4">
            No files yet. Create a file to get started.
          </p>
        )}
      </div>
    </div>
  );
}
