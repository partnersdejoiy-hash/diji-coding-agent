import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "@dejoiy/database";
import { workspaceEngine } from "@dejoiy/workspace-engine";
import { gitEngine } from "@dejoiy/git-engine";
import { AuthRequest, authenticate, verifyWorkspaceAccess } from "../middleware/auth.js";
import { validatePath } from "../utils/security.js";
import { getWorkspaceId } from "../utils/params.js";
import multer from "multer";
import { join } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  const workspaces = await prisma.workspace.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: "desc" },
  });
  res.json({ workspaces });
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  });

  try {
    const body = schema.parse(req.body);
    const workspace = await prisma.workspace.create({
      data: {
        name: body.name,
        description: body.description,
        rootPath: "",
        userId: req.userId!,
      },
    });

    const rootPath = workspaceEngine.ensureWorkspaceDir(workspace.id);
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { rootPath },
    });

    res.status(201).json({ workspace: { ...workspace, rootPath } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create workspace" });
  }
});

router.post("/clone", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(1),
    gitUrl: z.string().url(),
  });

  try {
    const body = schema.parse(req.body);
    const workspace = await prisma.workspace.create({
      data: {
        name: body.name,
        gitUrl: body.gitUrl,
        rootPath: "",
        userId: req.userId!,
      },
    });

    gitEngine.clone(body.gitUrl, workspace.id);
    const rootPath = workspaceEngine.getRootPath(workspace.id);

    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { rootPath },
    });

    res.status(201).json({ workspace: { ...workspace, rootPath } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Clone failed" });
  }
});

router.post("/:id/upload", upload.array("files"), async (req: AuthRequest, res: Response) => {
  const hasAccess = await verifyWorkspaceAccess(req.userId!, getWorkspaceId(req.params));
  if (!hasAccess) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const files = req.files as Express.Multer.File[];
  if (!files?.length) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const root = workspaceEngine.ensureWorkspaceDir(getWorkspaceId(req.params));

  for (const file of files) {
    const filePath = file.originalname;
    if (!validatePath(filePath)) continue;

    const fullPath = join(root, filePath);
    const dir = join(fullPath, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, file.buffer);
  }

  res.json({ uploaded: files.length });
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const workspace = await prisma.workspace.findFirst({
    where: { id: getWorkspaceId(req.params), userId: req.userId },
  });
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }
  res.json({ workspace });
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const workspace = await prisma.workspace.findFirst({
    where: { id: getWorkspaceId(req.params), userId: req.userId },
  });
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  await prisma.workspace.delete({ where: { id: workspace.id } });
  res.json({ deleted: true });
});

export default router;
