import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import authRoutes from "./routes/auth.js";
import workspaceRoutes from "./routes/workspaces.js";
import fileRoutes from "./routes/files.js";
import agentRoutes from "./routes/agent.js";
import settingsRoutes from "./routes/settings.js";
import { terminalRouter, gitRouter } from "./routes/terminal-git.js";
import { globalLimiter } from "./middleware/rate-limit.js";

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.API_PORT ?? "4000", 10);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  credentials: true,
}));

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(globalLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "dejoiy-codeagent-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/workspaces/:workspaceId/files", fileRoutes);
app.use("/api/workspaces/:workspaceId/agent", agentRoutes);
app.use("/api/workspaces/:workspaceId/terminal", terminalRouter);
app.use("/api/workspaces/:workspaceId/git", gitRouter);
app.use("/api/settings", settingsRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString()) as { type: string; payload?: unknown };
      if (message.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message" }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`DEJOIY-CodeAgent API running on port ${PORT}`);
});

export default app;
