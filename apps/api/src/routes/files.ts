import { Router, Response } from "express";
import { z } from "zod";
import { workspaceEngine } from "@dejoiy/workspace-engine";
import { AuthRequest, authenticate, verifyWorkspaceAccess } from "../middleware/auth.js";
import { validatePath } from "../utils/security.js";
import { getParam, getWorkspaceId } from "../utils/params.js";

const router = Router({ mergeParams: true });

router.use(authenticate);

async function checkAccess(req: AuthRequest, res: Response): Promise<string | null> {
  const workspaceId = getWorkspaceId(req.params);
  if (!workspaceId || !req.userId) {
    res.status(400).json({ error: "Workspace ID required" });
    return null;
  }
  const hasAccess = await verifyWorkspaceAccess(req.userId, workspaceId);
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied" });
    return null;
  }
  return workspaceId;
}

router.get("/tree", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;
  const tree = workspaceEngine.buildTree(workspaceId);
  res.json({ tree });
});

router.get("/file/*", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;
  const filePath = getParam(req.params[0]);

  if (!validatePath(filePath)) {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }

  try {
    const content = await workspaceEngine.readFile(workspaceId, filePath);
    res.json({ path: filePath, content });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.put("/file/*", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;
  const filePath = getParam(req.params[0]);

  if (!validatePath(filePath)) {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }

  const schema = z.object({ content: z.string() });
  try {
    const { content } = schema.parse(req.body);
    const diff = await workspaceEngine.writeFile(workspaceId, filePath, content);
    res.json({ diff });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to save file" });
  }
});

router.post("/file", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;

  const schema = z.object({
    path: z.string(),
    content: z.string().optional(),
  });

  try {
    const body = schema.parse(req.body);
    if (!validatePath(body.path)) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    const diff = await workspaceEngine.createFile(workspaceId, body.path, body.content ?? "");
    res.status(201).json({ diff });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create file" });
  }
});

router.delete("/file/*", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;
  const filePath = getParam(req.params[0]);

  if (!validatePath(filePath)) {
    res.status(400).json({ error: "Invalid file path" });
    return;
  }

  try {
    await workspaceEngine.deleteFile(workspaceId, filePath);
    res.json({ deleted: true });
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

router.post("/rename", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;

  const schema = z.object({
    oldPath: z.string(),
    newPath: z.string(),
    isDirectory: z.boolean().optional(),
  });

  try {
    const body = schema.parse(req.body);
    if (!validatePath(body.oldPath) || !validatePath(body.newPath)) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }

    if (body.isDirectory) {
      await workspaceEngine.renameDirectory(workspaceId, body.oldPath, body.newPath);
    } else {
      await workspaceEngine.renameFile(workspaceId, body.oldPath, body.newPath);
    }
    res.json({ renamed: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Rename failed" });
  }
});

router.post("/directory", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;

  const schema = z.object({ path: z.string() });
  try {
    const { path } = schema.parse(req.body);
    if (!validatePath(path)) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }
    await workspaceEngine.createDirectory(workspaceId, path);
    res.status(201).json({ created: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create directory" });
  }
});

router.delete("/directory/*", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;
  const dirPath = getParam(req.params[0]);

  try {
    await workspaceEngine.deleteDirectory(workspaceId, dirPath);
    res.json({ deleted: true });
  } catch {
    res.status(404).json({ error: "Directory not found" });
  }
});

router.get("/search", async (req: AuthRequest, res: Response) => {
  const workspaceId = await checkAccess(req, res);
  if (!workspaceId) return;
  const query = req.query.q as string;

  if (!query) {
    res.status(400).json({ error: "Query required" });
    return;
  }

  const results = workspaceEngine.searchCode(workspaceId, query);
  res.json({ results });
});

export default router;
