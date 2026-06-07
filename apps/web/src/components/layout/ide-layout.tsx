"use client";

import { FileExplorer } from "@/components/explorer/file-explorer";
import { CodeEditor } from "@/components/editor/code-editor";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { useAppStore } from "@/stores/app-store";

export function IDELayout() {
  const { sidebarWidth, chatWidth } = useAppStore();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <div style={{ width: sidebarWidth }} className="shrink-0">
          <FileExplorer />
        </div>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-hidden">
            <CodeEditor />
          </div>
          <TerminalPanel />
        </div>

        <div style={{ width: chatWidth }} className="shrink-0">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
