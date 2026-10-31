// Diji's built-in cloud browser: forwards to the Chromium server (Oracle VM) with a token that
// stays on this side, so every visitor gets a browser without setting anything up.
// Env: DIJI_BROWSER_URL (https://…sslip.io), DIJI_SERVER_TOKEN.
import { corsHeaders, json } from "./handlers.js";

const ACTIONS = new Set(["open", "search", "click", "type", "key", "scroll", "back", "forward", "reload", "shot", "read", "close"]);
const target = () => (process.env.DIJI_BROWSER_URL || "").replace(/\/+$/, "");

export async function browserProxyHandler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const action = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  if (action === "health") {
    // Ask the Chromium server itself, so "available" means it really answers.
    if (!target()) return json(request, 200, { ok: false, builtin: true });
    const up = await fetch(`${target()}/api/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false);
    return json(request, 200, { ok: up, builtin: true });
  }
  if (!target()) return json(request, 503, { error: "Diji's cloud browser is not set up on this deployment." });
  if (request.method !== "POST" || !ACTIONS.has(action)) return json(request, 404, { error: "Unknown browser action." });
  const body = await request.text();
  if (body.length > 20_000) return json(request, 413, { error: "That request is too large." });
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  let res;
  try {
    res = await fetch(`${target()}/api/browser/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-diji-token": process.env.DIJI_SERVER_TOKEN || "", "x-diji-client-ip": ip },
      body,
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return json(request, 502, { error: "Diji's cloud browser is waking up or offline. Try again in a moment." });
  }
  return new Response(res.body, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders(request) } });
}
