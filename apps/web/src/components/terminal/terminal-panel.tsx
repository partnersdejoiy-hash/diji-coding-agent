"use client";

import { useRef, useEffect } from "react";
import { Terminal as TerminalIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function TerminalPanel() {
  const {
    terminalHistory,
    terminalInput,
    currentWorkspace,
    addTerminalOutput,
    setTerminalInput,
  } = useAppStore();

  const [collapsed, setCollapsed] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
  }, [terminalHistory]);

  const handleExecute = async () => {
    if (!terminalInput.trim() || !currentWorkspace) return;

    const command = terminalInput.trim();
    setTerminalInput("");

    addTerminalOutput({
      command,
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    try {
      const res = await api.post<{
        result: { stdout: string; stderr: string; exitCode: number; command: string };
      }>(`/api/workspaces/${currentWorkspace.id}/terminal/execute`, { command });

      addTerminalOutput({
        command: res.result.command,
        stdout: res.result.stdout,
        stderr: res.result.stderr,
        exitCode: res.result.exitCode,
      });
    } catch (err) {
      addTerminalOutput({
        command,
        stdout: "",
        stderr: err instanceof Error ? err.message : "Execution failed",
        exitCode: 1,
      });
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-[#1a1b26] border-t border-border transition-all",
        collapsed ? "h-8" : "h-[200px]"
      )}
    >
      <div className="flex items-center justify-between px-3 py-1 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Terminal</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <>
          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs"
          >
            {terminalHistory.map((entry, i) => (
              <div key={i} className="mb-2">
                <div className="text-green-400">
                  $ {entry.command}
                </div>
                {entry.stdout && (
                  <pre className="text-gray-300 whitespace-pre-wrap">{entry.stdout}</pre>
                )}
                {entry.stderr && (
                  <pre className="text-red-400 whitespace-pre-wrap">{entry.stderr}</pre>
                )}
                {entry.exitCode !== 0 && (
                  <div className="text-red-400">Exit code: {entry.exitCode}</div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center px-3 py-1.5 border-t border-border/50">
            <span className="text-green-400 font-mono text-xs mr-2">$</span>
            <input
              className="flex-1 bg-transparent font-mono text-xs text-gray-300 outline-none"
              value={terminalInput}
              onChange={(e) => setTerminalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExecute()}
              placeholder="Enter command..."
            />
          </div>
        </>
      )}
    </div>
  );
}
