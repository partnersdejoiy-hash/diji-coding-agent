"use client";

import dynamic from "next/dynamic";
import { X, Save, Search } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Loading editor...
    </div>
  ),
});

export function CodeEditor() {
  const {
    tabs,
    activeTab,
    currentWorkspace,
    setActiveTab,
    closeTab,
    updateTabContent,
    markTabSaved,
  } = useAppStore();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");

  const activeTabData = tabs.find((t) => t.path === activeTab);

  const handleSave = async () => {
    if (!activeTabData || !currentWorkspace) return;
    await api.put(
      `/api/workspaces/${currentWorkspace.id}/files/file/${activeTabData.path}`,
      { content: activeTabData.content }
    );
    markTabSaved(activeTabData.path);
  };

  const handleReplace = () => {
    if (!activeTabData || !searchQuery) return;
    const newContent = activeTabData.content.replace(
      new RegExp(searchQuery, "g"),
      replaceQuery
    );
    updateTabContent(activeTabData.path, newContent);
  };

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground">
        <p className="text-lg font-medium">DEJOIY CodeAgent</p>
        <p className="text-sm mt-2">Open a file from the explorer to start editing</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center bg-card border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.path}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border cursor-pointer group min-w-0",
              activeTab === tab.path
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab(tab.path)}
          >
            <span className="truncate max-w-[120px]">
              {tab.isDirty && <span className="text-primary mr-1">●</span>}
              {tab.path.split("/").pop()}
            </span>
            <button
              className="opacity-0 group-hover:opacity-100 hover:bg-muted rounded p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.path);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1 px-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSearch(!showSearch)}>
            <Search className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
            <Save className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
          <input
            className="bg-background border border-input rounded px-2 py-1 text-xs flex-1"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <input
            className="bg-background border border-input rounded px-2 py-1 text-xs flex-1"
            placeholder="Replace..."
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleReplace}>
            Replace All
          </Button>
        </div>
      )}

      <div className="flex-1">
        {activeTabData && (
          <MonacoEditor
            height="100%"
            language={activeTabData.language}
            theme="vs-dark"
            value={activeTabData.content}
            onChange={(value) =>
              updateTabContent(activeTabData.path, value ?? "")
            }
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              tabSize: 2,
              automaticLayout: true,
              padding: { top: 8 },
            }}
          />
        )}
      </div>
    </div>
  );
}
