import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "@dejoiy/database";
import { AgentLoop } from "@dejoiy/agent-core";
import { indexingEngine } from "@dejoiy/agent-core";
import { AuthRequest, authenticate, verifyWorkspaceAccess } from "../middleware/auth.js";
import { agentLimiter } from "../middleware/rate-limit.js";
import { getAgentConfig, sanitizeResponse } from "../utils/security.js";
import { getWorkspaceId } from "../utils/params.js";

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post("/chat", agentLimiter, async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId || !req.userId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const hasAccess = await verifyWorkspaceAccess(req.userId, workspaceId);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const schema = z.object({
    message: z.string().min(1),
    mode: z.enum(["CHAT", "ASK", "AGENT", "REFACTOR", "EXPLAIN"]).optional(),
    currentFile: z.string().optional(),
    stream: z.boolean().optional(),
  });

  try {
    const body = schema.parse(req.body);
    const config = await getAgentConfig(req.userId);
    config.mode = body.mode ?? "CHAT";

    if (!config.apiKey) {
      res.status(400).json({ error: "OpenAI API key not configured. Set it in Settings." });
      return;
    }

    const agent = new AgentLoop(config);

    await prisma.chatMessage.create({
      data: {
        workspaceId,
        userId: req.userId,
        role: "user",
        content: body.message,
        mode: body.mode ?? "CHAT",
      },
    });

    if (body.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const result = await agent.chat(
        body.message,
        {
          workspaceId,
          userId: req.userId,
          currentFile: body.currentFile,
          openaiApiKey: config.apiKey,
        },
        (chunk) => {
          res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
        }
      );

      await prisma.chatMessage.create({
        data: {
          workspaceId,
          userId: req.userId,
          role: "assistant",
          content: result,
          mode: body.mode ?? "CHAT",
        },
      });

      res.write(`data: ${JSON.stringify({ type: "done", content: result })}\n\n`);
      res.end();
      return;
    }

    const result = await agent.chat(body.message, {
      workspaceId,
      userId: req.userId,
      currentFile: body.currentFile,
      openaiApiKey: config.apiKey,
    });

    await prisma.chatMessage.create({
      data: {
        workspaceId,
        userId: req.userId,
        role: "assistant",
        content: result,
        mode: body.mode ?? "CHAT",
      },
    });

    res.json({ response: sanitizeResponse(result) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Chat failed" });
  }
});

router.post("/run", agentLimiter, async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId || !req.userId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const hasAccess = await verifyWorkspaceAccess(req.userId, workspaceId);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const schema = z.object({
    task: z.string().min(1),
    currentFile: z.string().optional(),
  });

  try {
    const body = schema.parse(req.body);
    const config = await getAgentConfig(req.userId);

    if (!config.apiKey) {
      res.status(400).json({ error: "OpenAI API key not configured" });
      return;
    }

    config.mode = "AGENT";
    const agent = new AgentLoop(config);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const result = await agent.run(
      body.task,
      {
        workspaceId,
        userId: req.userId,
        currentFile: body.currentFile,
        openaiApiKey: config.apiKey,
        sessionId: `run_${Date.now()}`,
      },
      (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ type: "final", data: result })}\n\n`);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Agent run failed" });
  }
});

router.get("/history", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId || !req.userId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const messages = await prisma.chatMessage.findMany({
    where: { workspaceId, userId: req.userId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  res.json({ messages });
});

router.post("/index", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId || !req.userId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const config = await getAgentConfig(req.userId);

  indexingEngine
    .indexWorkspace(workspaceId, config.apiKey || undefined)
    .catch(() => {});

  res.json({ status: "indexing_started" });
});

router.get("/index/status", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const status = await indexingEngine.getIndexStatus(workspaceId);
  res.json({ status });
});

export default router;
