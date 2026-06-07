const SENSITIVE_KEYS = ["OPENAI_API_KEY", "DATABASE_URL", "JWT_SECRET", "password", "passwordHash"];

export function getUserSettings(userId: string) {
  return import("@dejoiy/database").then(({ prisma: db }) =>
    db.userSettings.findUnique({ where: { userId } })
  );
}

export function sanitizeResponse(data: unknown): unknown {
  if (typeof data === "string") {
    let result = data;
    for (const key of SENSITIVE_KEYS) {
      const regex = new RegExp(`${key}[=:\\s]*[^\\s,}"']+`, "gi");
      result = result.replace(regex, `${key}=[REDACTED]`);
    }
    return result;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeResponse);
  }

  if (data && typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeResponse(value);
      }
    }
    return sanitized;
  }

  return data;
}

export function validatePath(path: string): boolean {
  if (path.includes("..")) return false;
  if (path.startsWith("/")) return false;
  if (/[<>"|*?]/.test(path)) return false;
  return true;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export async function getAgentConfig(userId: string) {
  const settings = await getUserSettings(userId);
  return {
    apiKey: settings?.openaiApiKey ?? process.env.OPENAI_API_KEY ?? "",
    model: settings?.model ?? "gpt-4o",
    temperature: settings?.temperature ?? 0.7,
    maxTokens: settings?.maxTokens ?? 4096,
    autonomyLevel: settings?.autonomyLevel ?? 3,
    mode: "AGENT",
  };
}
