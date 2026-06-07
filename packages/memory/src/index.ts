import { prisma, Prisma } from "@dejoiy/database";

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ShortTermMemoryData {
  sessionId: string;
  workspaceId: string;
  task?: string;
  currentFiles: string[];
  conversation: ConversationMessage[];
  context?: Record<string, unknown>;
}

export class ShortTermMemory {
  async get(sessionId: string): Promise<ShortTermMemoryData | null> {
    const memory = await prisma.shortTermMemory.findUnique({
      where: { sessionId },
    });
    if (!memory) return null;
    return {
      sessionId: memory.sessionId,
      workspaceId: memory.workspaceId,
      task: memory.task ?? undefined,
      currentFiles: memory.currentFiles as unknown as string[],
      conversation: memory.conversation as unknown as ConversationMessage[],
      context: memory.context as unknown as Record<string, unknown> | undefined,
    };
  }

  async set(data: ShortTermMemoryData): Promise<void> {
    await prisma.shortTermMemory.upsert({
      where: { sessionId: data.sessionId },
      create: {
        sessionId: data.sessionId,
        workspaceId: data.workspaceId,
        task: data.task,
        currentFiles: data.currentFiles as unknown as Prisma.InputJsonValue,
        conversation: data.conversation as unknown as Prisma.InputJsonValue,
        context: (data.context ?? {}) as unknown as Prisma.InputJsonValue,
      },
      update: {
        task: data.task,
        currentFiles: data.currentFiles as unknown as Prisma.InputJsonValue,
        conversation: data.conversation as unknown as Prisma.InputJsonValue,
        context: (data.context ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async addMessage(
    sessionId: string,
    workspaceId: string,
    message: ConversationMessage
  ): Promise<void> {
    const existing = await this.get(sessionId);
    const conversation = existing?.conversation ?? [];
    conversation.push({ ...message, timestamp: new Date().toISOString() });

    const maxMessages = 50;
    const trimmed = conversation.slice(-maxMessages);

    await this.set({
      sessionId,
      workspaceId,
      task: existing?.task,
      currentFiles: existing?.currentFiles ?? [],
      conversation: trimmed,
      context: existing?.context,
    });
  }

  async setTask(sessionId: string, workspaceId: string, task: string): Promise<void> {
    const existing = await this.get(sessionId);
    await this.set({
      sessionId,
      workspaceId,
      task,
      currentFiles: existing?.currentFiles ?? [],
      conversation: existing?.conversation ?? [],
      context: existing?.context,
    });
  }

  async setCurrentFiles(
    sessionId: string,
    workspaceId: string,
    files: string[]
  ): Promise<void> {
    const existing = await this.get(sessionId);
    await this.set({
      sessionId,
      workspaceId,
      task: existing?.task,
      currentFiles: files,
      conversation: existing?.conversation ?? [],
      context: existing?.context,
    });
  }

  async clear(sessionId: string): Promise<void> {
    await prisma.shortTermMemory.delete({ where: { sessionId } }).catch(() => {});
  }
}

export class LongTermMemoryStore {
  async store(
    userId: string,
    category: string,
    key: string,
    value: string,
    workspaceId?: string
  ): Promise<void> {
    const existing = await prisma.longTermMemory.findFirst({
      where: { userId, workspaceId: workspaceId ?? null, category, key },
    });

    if (existing) {
      await prisma.longTermMemory.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await prisma.longTermMemory.create({
        data: { userId, workspaceId, category, key, value },
      });
    }
  }

  async retrieve(
    userId: string,
    category?: string,
    workspaceId?: string
  ): Promise<Array<{ key: string; value: string; category: string }>> {
    const memories = await prisma.longTermMemory.findMany({
      where: {
        userId,
        ...(category ? { category } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    return memories.map((m) => ({
      key: m.key,
      value: m.value,
      category: m.category,
    }));
  }

  async storePattern(
    userId: string,
    workspaceId: string,
    pattern: string,
    description: string
  ): Promise<void> {
    await this.store(userId, "project_patterns", pattern, description, workspaceId);
  }

  async storePreference(
    userId: string,
    key: string,
    value: string
  ): Promise<void> {
    await this.store(userId, "user_preferences", key, value);
  }

  async storeArchitecture(
    userId: string,
    workspaceId: string,
    component: string,
    description: string
  ): Promise<void> {
    await this.store(userId, "architecture", component, description, workspaceId);
  }

  async buildContextString(userId: string, workspaceId?: string): Promise<string> {
    const memories = await this.retrieve(userId, undefined, workspaceId);
    if (memories.length === 0) return "";

    const grouped = memories.reduce<Record<string, string[]>>((acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category]!.push(`${m.key}: ${m.value}`);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([cat, items]) => `### ${cat}\n${items.join("\n")}`)
      .join("\n\n");
  }
}

export const shortTermMemory = new ShortTermMemory();
export const longTermMemory = new LongTermMemoryStore();
