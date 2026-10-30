// Deploys a Diji workspace to the person's own Vercel account with the token they bring.
// Stateless: the token is used for this request only, never stored or logged.
import { HttpError } from "./llm.js";

const API = () => process.env.DIJI_VERCEL_API || "https://api.vercel.com";
const MAX_FILES = 300;
const MAX_BYTES = 4_000_000;

async function vercel(path, token, init = {}) {
  let res;
  try {
    res = await fetch(API() + path, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpError(502, "Could not reach Vercel. Try again in a moment.");
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = j.error?.message || `Vercel answered ${res.status}.`;
    const hint = res.status === 401 || res.status === 403 ? " Check your Vercel token (and team) in Settings → Deploy." : "";
    throw new HttpError(res.status === 401 || res.status === 403 ? res.status : 502, msg + hint);
  }
  return j;
}

export async function deployWorkspace(body) {
  const { token, team, name, files } = body || {};
  if (!token || typeof token !== "string") throw new HttpError(401, "Add your Vercel token in Settings → Deploy.");
  if (!name || !/^[a-z0-9][a-z0-9._-]{0,59}$/.test(name)) throw new HttpError(400, "Project name may use lowercase letters, numbers, dots and dashes.");
  if (!files || typeof files !== "object") throw new HttpError(400, "No files to deploy.");
  const entries = Object.entries(files).filter(([p, c]) => typeof p === "string" && typeof c === "string" && !p.includes(".."));
  if (!entries.length) throw new HttpError(400, "No files to deploy.");
  if (entries.length > MAX_FILES) throw new HttpError(413, `That is more than ${MAX_FILES} files.`);
  if (entries.reduce((n, [, c]) => n + c.length, 0) > MAX_BYTES) throw new HttpError(413, "The workspace is over 4 MB. Push it to GitHub and import it in Vercel instead.");

  const q = new URLSearchParams({ skipAutoDetectionConfirmation: "1" });
  if (team) q.set("teamId", String(team));
  const dep = await vercel(`/v13/deployments?${q}`, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      target: "production",
      files: entries.map(([file, data]) => ({ file: file.replace(/^\/+/, ""), data })),
      projectSettings: { framework: null, buildCommand: null, installCommand: null, outputDirectory: null },
    }),
  });

  // Wait for the build so the person gets a working link, not a spinner. Static sites take seconds.
  let d = dep;
  const teamQ = team ? `?teamId=${encodeURIComponent(team)}` : "";
  for (let i = 0; i < 20 && !["READY", "ERROR", "CANCELED"].includes(d.readyState); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    d = await vercel(`/v13/deployments/${dep.id}${teamQ}`, token);
  }
  if (d.readyState === "ERROR" || d.readyState === "CANCELED") throw new HttpError(502, "Vercel could not build this workspace. Open the Vercel dashboard for the build log.");
  const host = (d.alias || []).find((a) => a.endsWith(".vercel.app") && !a.includes("-git-")) || d.alias?.[0] || d.url;
  return { url: `https://${host}`, state: d.readyState, id: dep.id, ready: d.readyState === "READY" };
}
