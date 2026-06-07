"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { api, ChatMode } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MODES: { value: ChatMode; label: string }[] = [
  { value: "CHAT", label: "Chat" },
  { value: "ASK", label: "Ask" },
  { value: "AGENT", label: "Agent" },
  { value: "REFACTOR", label: "Refactor" },
  { value: "EXPLAIN", label: "Explain" },
];

export function ChatPanel() {
  const {
    chatMessages,
    chatMode,
    currentWorkspace,
    activeTab,
    isAgentRunning,
    addChatMessage,
    setChatMode,
    setAgentRunning,
    loadFileTree,
  } = useAppStore();

  const [input, setInput] = useState("");
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || !currentWorkspace || isAgentRunning) return;

    const userMessage = input.trim();
    setInput("");
    addChatMessage({
      id: Date.now().toString(),
      role: "user",
      content: userMessage,
      mode: chatMode,
    });

    if (chatMode === "AGENT") {
      setAgentRunning(true);
      setStreamingContent("");

      try {
        await api.stream(
          `/api/workspaces/${currentWorkspace.id}/agent/run`,
          { task: userMessage, currentFile: activeTab ?? undefined },
          (event) => {
            const e = event as { type: string; data?: { content?: string; result?: string } };
            if (e.type === "thought" || e.type === "action" || e.type === "observation") {
              setStreamingContent((prev) => prev + `[${e.type}] ${JSON.stringify(e.data)}\n`);
            }
            if (e.type === "complete" || e.type === "final") {
              const result = e.data?.result ?? e.data?.content ?? "Task completed.";
              addChatMessage({
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: result,
                mode: chatMode,
              });
              setStreamingContent("");
              loadFileTree();
            }
          }
        );
      } catch (err) {
        addChatMessage({
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Agent failed"}`,
        });
      } finally {
        setAgentRunning(false);
      }
      return;
    }

    setStreamingContent("");
    let fullResponse = "";

    try {
      await api.stream(
        `/api/workspaces/${currentWorkspace.id}/agent/chat`,
        {
          message: userMessage,
          mode: chatMode,
          currentFile: activeTab ?? undefined,
          stream: true,
        },
        (event) => {
          const e = event as { type: string; content?: string };
          if (e.type === "chunk" && e.content) {
            fullResponse += e.content;
            setStreamingContent(fullResponse);
          }
          if (e.type === "done") {
            addChatMessage({
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: e.content ?? fullResponse,
              mode: chatMode,
            });
            setStreamingContent("");
          }
        }
      );
    } catch {
      try {
        const res = await api.post<{ response: string }>(
          `/api/workspaces/${currentWorkspace.id}/agent/chat`,
          {
            message: userMessage,
            mode: chatMode,
            currentFile: activeTab ?? undefined,
          }
        );
        addChatMessage({
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: res.response,
          mode: chatMode,
        });
      } catch (err) {
        addChatMessage({
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Request failed"}`,
        });
      }
      setStreamingContent("");
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI Assistant
        </span>
        <div className="flex gap-0.5">
          {MODES.map((mode) => (
            <button
              key={mode.value}
              className={cn(
                "px-2 py-0.5 text-[10px] rounded font-medium transition-colors",
                chatMode === mode.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              onClick={() => setChatMode(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Ask anything about your codebase</p>
            <p className="text-xs mt-1">Switch to Agent mode for autonomous tasks</p>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-2",
              msg.role === "user" ? "flex-row-reverse" : ""
            )}
          >
            <div
              className={cn(
                "shrink-0 h-6 w-6 rounded-full flex items-center justify-center",
                msg.role === "user" ? "bg-primary" : "bg-muted"
              )}
            >
              {msg.role === "user" ? (
                <User className="h-3.5 w-3.5" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
            </div>
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-sm max-w-[90%] chat-message",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="flex gap-2">
            <div className="shrink-0 h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </div>
            <div className="rounded-lg px-3 py-2 text-sm bg-muted max-w-[90%]">
              <pre className="whitespace-pre-wrap font-sans text-xs">{streamingContent}</pre>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Textarea
            placeholder={
              chatMode === "AGENT"
                ? "Describe a task for the agent..."
                : "Ask a question..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="min-h-[60px] text-sm resize-none"
            disabled={isAgentRunning}
          />
          <Button
            size="icon"
            className="shrink-0 self-end"
            onClick={handleSend}
            disabled={!input.trim() || isAgentRunning}
          >
            {isAgentRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
