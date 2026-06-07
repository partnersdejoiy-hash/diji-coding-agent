"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { TopBar } from "@/components/layout/top-bar";
import { IDELayout } from "@/components/layout/ide-layout";
import { api } from "@/lib/api";

export default function WorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  const {
    token,
    setCurrentWorkspace,
    loadFileTree,
    setChatMessages,
  } = useAppStore();

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    api
      .get<{ workspace: { id: string; name: string; description?: string; isIndexed: boolean } }>(
        `/api/workspaces/${workspaceId}`
      )
      .then((res) => {
        setCurrentWorkspace(res.workspace as Parameters<typeof setCurrentWorkspace>[0]);
        loadFileTree();
        api
          .post(`/api/workspaces/${workspaceId}/agent/index`, {})
          .catch(() => {});
      })
      .catch(() => router.push("/"));

    api
      .get<{ messages: Array<{ id: string; role: string; content: string; mode?: string }> }>(
        `/api/workspaces/${workspaceId}/agent/history`
      )
      .then((res) =>
        setChatMessages(
          res.messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            mode: m.mode,
          }))
        )
      )
      .catch(() => {});
  }, [workspaceId, token]);

  return (
    <div className="flex flex-col h-screen">
      <TopBar />
      <div className="flex-1 overflow-hidden">
        <IDELayout />
      </div>
    </div>
  );
}
