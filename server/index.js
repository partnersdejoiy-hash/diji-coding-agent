// Diji server for an Oracle Cloud Always Free VM: cloud browser + chat proxy + the web UI, one process.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { chatHandler, modelsHandler, deployHandler, corsHeaders, json } from "../web/api/_lib/handlers.js";
import { browserAction, BrowserError, shutdownBrowsers } from "./browser.js";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.DIJI_SERVER_TOKEN || "";
const WEB = fileURLToPath(new URL("../web/", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
};

// Fixed-window limiter per IP. shortcut: in-memory, resets on restart; fine for one VM.
const hits = new Map();
function limited(ip, max) {
  const now = Math.floor(Date.now() / 60000);
  const h = hits.get(ip);
  if (!h || h.win !== now) {
    hits.set(ip, { win: now, n: 1 });
    return false;
  }
  return ++h.n > max;
}
setInterval(() => hits.clear(), 10 * 60000).unref();

function toRequest(req, signal) {
  const url = `http://${req.headers.host || "localhost"}${req.url}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: "half",
    signal,
  });
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(WEB, path));
  if (!file.startsWith(WEB) || file.includes(`${WEB}api`)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": path.startsWith("/vendor/") ? "public, max-age=604800" : "no-cache",
      "x-content-type-options": "nosniff",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(200, { "content-type": TYPES[".html"] });
    res.end(await readFile(join(WEB, "index.html")));
  }
}

const server = http.createServer(async (req, res) => {
  const ac = new AbortController();
  res.on("close", () => ac.abort());
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  const path = new URL(req.url, "http://x").pathname;
  try {
    if (!path.startsWith("/api/")) return await serveStatic(req, res);
    const request = toRequest(req, ac.signal);
    if (req.method === "OPTIONS") return await send(res, new Response(null, { status: 204, headers: corsHeaders(request) }));
    if (path === "/api/health") return await send(res, json(request, 200, { ok: true, browser: true, auth: Boolean(TOKEN), name: "diji-server" }));
    if (TOKEN && req.headers["x-diji-token"] !== TOKEN) return await send(res, json(request, 401, { error: "This Diji server needs an access token. Add it in Settings → Cloud." }));
    if (path === "/api/chat") {
      if (limited(ip + ":chat", 40)) return await send(res, json(request, 429, { error: "Too many messages this minute. Take a breath and try again." }));
      return await send(res, await chatHandler(request));
    }
    if (path === "/api/models") return await send(res, await modelsHandler(request));
    if (path === "/api/deploy") {
      if (limited(ip + ":deploy", 10)) return await send(res, json(request, 429, { error: "Too many deploys this minute." }));
      return await send(res, await deployHandler(request));
    }
    const m = path.match(/^\/api\/browser\/([a-z]+)$/);
    if (m && req.method === "POST") {
      if (limited(ip + ":browser", 90)) return await send(res, json(request, 429, { error: "The cloud browser is busy. Slow down a little." }));
      let body;
      try {
        body = JSON.parse((await request.text()) || "{}");
      } catch {
        return await send(res, json(request, 400, { error: "Request body must be JSON." }));
      }
      try {
        return await send(res, json(request, 200, await browserAction(m[1], body)));
      } catch (e) {
        const status = e instanceof BrowserError ? e.status : 500;
        if (status === 500) console.error("browser:", e.message);
        return await send(res, json(request, status, { error: status === 500 ? "The cloud browser hit a problem. Try again." : e.message }));
      }
    }
    return await send(res, json(request, 404, { error: "Not found." }));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Server error." }));
  }
});

server.listen(PORT, () => console.log(`Diji server on http://localhost:${PORT}${TOKEN ? " (token required)" : ""}`));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    server.close();
    await shutdownBrowsers();
    process.exit(0);
  });
}
