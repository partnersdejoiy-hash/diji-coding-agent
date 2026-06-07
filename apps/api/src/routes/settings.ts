import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "@dejoiy/database";
import { AuthRequest, authenticate } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);

router.get("/", async (req: AuthRequest, res: Response) => {
  const settings = await prisma.userSettings.findUnique({
    where: { userId: req.userId },
  });

  res.json({
    settings: settings
      ? {
          model: settings.model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          autonomyLevel: settings.autonomyLevel,
          hasApiKey: !!settings.openaiApiKey,
        }
      : null,
  });
});

router.put("/", async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    openaiApiKey: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(256).max(128000).optional(),
    autonomyLevel: z.number().min(1).max(5).optional(),
  });

  try {
    const body = schema.parse(req.body);

    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId! },
      create: {
        userId: req.userId!,
        openaiApiKey: body.openaiApiKey,
        model: body.model ?? "gpt-4o",
        temperature: body.temperature ?? 0.7,
        maxTokens: body.maxTokens ?? 4096,
        autonomyLevel: body.autonomyLevel ?? 3,
      },
      update: {
        ...(body.openaiApiKey !== undefined ? { openaiApiKey: body.openaiApiKey } : {}),
        ...(body.model ? { model: body.model } : {}),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.maxTokens ? { maxTokens: body.maxTokens } : {}),
        ...(body.autonomyLevel ? { autonomyLevel: body.autonomyLevel } : {}),
      },
    });

    res.json({
      settings: {
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        autonomyLevel: settings.autonomyLevel,
        hasApiKey: !!settings.openaiApiKey,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
