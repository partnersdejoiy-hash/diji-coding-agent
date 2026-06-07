import { Router, Response } from "express";
import { z } from "zod";
import { terminalEngine } from "@dejoiy/terminal-engine";
import { gitEngine } from "@dejoiy/git-engine";
import { AuthRequest, authenticate, verifyWorkspaceAccess } from "../middleware/auth.js";
import { sanitizeResponse } from "../utils/security.js";
import { getWorkspaceId } from "../utils/params.js";

const terminalRouter = Router({ mergeParams: true });
const gitRouter = Router({ mergeParams: true });

terminalRouter.use(authenticate);
gitRouter.use(authenticate);

terminalRouter.post("/execute", async (req: AuthRequest, res: Response) => {
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

  const schema = z.object({ command: z.string().min(1) });
  try {
    const { command } = schema.parse(req.body);
    const result = await terminalEngine.execute(workspaceId, command);
    res.json({ result: sanitizeResponse(result) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Execution failed" });
  }
});

terminalRouter.post("/test", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId || !req.userId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const schema = z.object({ framework: z.string().optional() });
  const { framework } = schema.parse(req.body);
  const result = await terminalEngine.runTests(workspaceId, framework);
  res.json({ result: sanitizeResponse(result) });
});

gitRouter.get("/status", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId || !req.userId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const status = gitEngine.status(workspaceId);
  res.json({ status });
});

gitRouter.get("/diff", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const file = req.query.file as string | undefined;
  const diffs = gitEngine.diff(workspaceId, file);
  res.json({ diffs });
});

gitRouter.get("/branches", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const branches = gitEngine.branches(workspaceId);
  res.json({ branches });
});

gitRouter.post("/checkout", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const schema = z.object({ branch: z.string() });
  const { branch } = schema.parse(req.body);
  gitEngine.checkout(workspaceId, branch);
  res.json({ checkedOut: branch });
});

gitRouter.post("/commit", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const schema = z.object({
    message: z.string().min(1),
    files: z.array(z.string()).optional(),
    preview: z.boolean().optional(),
  });

  const body = schema.parse(req.body);

  if (body.preview) {
    const preview = gitEngine.commitPreview(workspaceId, body.message, body.files);
    res.json({ preview });
    return;
  }

  const result = gitEngine.commit(workspaceId, body.message, body.files);
  res.json({ result });
});

gitRouter.get("/log", async (req: AuthRequest, res: Response) => {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId) {
    res.status(400).json({ error: "Workspace ID required" });
    return;
  }

  const log = gitEngine.log(workspaceId);
  res.json({ log });
});

export { terminalRouter, gitRouter };
