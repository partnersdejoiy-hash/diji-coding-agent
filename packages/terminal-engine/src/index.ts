import { spawn } from "child_process";
import { workspaceEngine } from "@dejoiy/workspace-engine";

const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=",
  ":(){ :|:& };:",
  "chmod -R 777 /",
  "curl.*|.*sh",
  "wget.*|.*sh",
];

const ALLOWED_COMMANDS = new Set([
  "npm", "pnpm", "yarn", "node", "npx",
  "python", "python3", "pip", "pip3",
  "composer", "php",
  "go", "cargo", "rustc",
  "git", "make", "cmake",
  "jest", "vitest", "playwright", "cypress",
  "pytest", "tsc", "eslint", "prettier",
  "cat", "ls", "pwd", "echo", "mkdir", "touch",
  "grep", "find", "wc", "head", "tail",
]);

export interface TerminalResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface TerminalSession {
  id: string;
  workspaceId: string;
  history: TerminalResult[];
}

export class TerminalEngine {
  private sessions: Map<string, TerminalSession> = new Map();

  validateCommand(command: string): { valid: boolean; reason?: string } {
    const trimmed = command.trim();

    for (const blocked of BLOCKED_COMMANDS) {
      if (new RegExp(blocked, "i").test(trimmed)) {
        return { valid: false, reason: "Command blocked for security reasons" };
      }
    }

    const baseCommand = trimmed.split(/\s+/)[0]?.split("/").pop() ?? "";
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return { valid: false, reason: `Command '${baseCommand}' is not in the allowed list` };
    }

    if (trimmed.includes("&&") || trimmed.includes("||") || trimmed.includes(";")) {
      const parts = trimmed.split(/&&|\|\||;/).map((p) => p.trim());
      for (const part of parts) {
        const result = this.validateCommand(part);
        if (!result.valid) return result;
      }
    }

    if (trimmed.includes("|")) {
      const parts = trimmed.split("|").map((p) => p.trim());
      for (const part of parts) {
        const base = part.split(/\s+/)[0]?.split("/").pop() ?? "";
        if (!ALLOWED_COMMANDS.has(base)) {
          return { valid: false, reason: `Piped command '${base}' is not allowed` };
        }
      }
    }

    return { valid: true };
  }

  async execute(
    workspaceId: string,
    command: string,
    sessionId?: string,
    timeoutMs = 120000
  ): Promise<TerminalResult> {
    const validation = this.validateCommand(command);
    if (!validation.valid) {
      return {
        command,
        stdout: "",
        stderr: validation.reason ?? "Command not allowed",
        exitCode: 1,
        duration: 0,
      };
    }

    const cwd = workspaceEngine.ensureWorkspaceDir(workspaceId);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], {
        cwd,
        env: {
          ...process.env,
          OPENAI_API_KEY: undefined,
          DATABASE_URL: undefined,
          JWT_SECRET: undefined,
        },
        timeout: timeoutMs,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        const result: TerminalResult = {
          command,
          stdout: stdout.slice(0, 100000),
          stderr: stderr.slice(0, 100000),
          exitCode: code ?? 1,
          duration: Date.now() - startTime,
        };

        if (sessionId) {
          const session = this.sessions.get(sessionId);
          if (session) {
            session.history.push(result);
          }
        }

        resolve(result);
      });

      child.on("error", (err) => {
        resolve({
          command,
          stdout: "",
          stderr: err.message,
          exitCode: 1,
          duration: Date.now() - startTime,
        });
      });
    });
  }

  createSession(workspaceId: string): TerminalSession {
    const id = `term_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const session: TerminalSession = { id, workspaceId, history: [] };
    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  async runTests(
    workspaceId: string,
    framework?: string
  ): Promise<TerminalResult> {
    let command = "npm test";
    if (framework === "vitest") command = "npx vitest run";
    else if (framework === "jest") command = "npx jest";
    else if (framework === "playwright") command = "npx playwright test";
    else if (framework === "cypress") command = "npx cypress run";
    else if (framework === "pytest") command = "python -m pytest";

    return this.execute(workspaceId, command);
  }

  detectTestFramework(workspaceId: string): string | null {
    try {
      const pkg = workspaceEngine.readFileSync(workspaceId, "package.json");
      const parsed = JSON.parse(pkg) as { devDependencies?: Record<string, string>; scripts?: Record<string, string> };

      if (parsed.devDependencies?.vitest || parsed.scripts?.test?.includes("vitest")) return "vitest";
      if (parsed.devDependencies?.jest || parsed.scripts?.test?.includes("jest")) return "jest";
      if (parsed.devDependencies?.["@playwright/test"]) return "playwright";
      if (parsed.devDependencies?.cypress) return "cypress";
    } catch { /* no package.json */ }

    try {
      workspaceEngine.readFileSync(workspaceId, "pytest.ini");
      return "pytest";
    } catch { /* no pytest.ini */ }

    return null;
  }
}

export const terminalEngine = new TerminalEngine();
