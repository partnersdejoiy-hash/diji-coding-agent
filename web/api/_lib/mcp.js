// Minimal MCP client over Streamable HTTP (JSON-RPC 2.0), used as a stateless relay so the
// browser can use remote MCP servers that do not send CORS headers. Each call opens a fresh session.
import { assertPublicUrl, HttpError } from "./llm.js";

const PROTOCOL = "2025-06-18";
const TIMEOUT = 25000;

// Reads a JSON-RPC reply that may come back as plain JSON or as an SSE stream.
async function readReply(res, id) {
  const type = res.headers.get("content-type") || "";
  const text = await res.text();
  const messages = [];
  if (type.includes("text/event-stream")) {
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (data) try { messages.push(JSON.parse(data)); } catch {}
    }
  } else if (text.trim()) {
    const j = JSON.parse(text);
    messages.push(...(Array.isArray(j) ? j : [j]));
  }
  const reply = messages.find((m) => m.id === id);
  if (!reply) throw new HttpError(502, "The MCP server sent no reply.");
  if (reply.error) throw new HttpError(502, `MCP error: ${reply.error.message || "unknown"}`);
  return reply.result;
}

async function rpc(url, headers, session, method, params, id) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL,
      ...(session.id ? { "mcp-session-id": session.id } : {}),
      ...headers,
    },
    body: JSON.stringify(id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params }),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e) => {
    throw new HttpError(502, `Could not reach the MCP server (${e.cause?.code || e.name}).`);
  });
  if (res.status === 401 || res.status === 403) throw new HttpError(401, "The MCP server refused the request. Check its access token.");
  if (!res.ok && res.status !== 202) throw new HttpError(502, `The MCP server answered ${res.status}.`);
  session.id ||= res.headers.get("mcp-session-id") || "";
  if (id === undefined) return null;
  return readReply(res, id);
}

async function open(url, headers) {
  const session = { id: "" };
  const init = await rpc(url, headers, session, "initialize", {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: "diji", version: "1.0.0" },
  }, 1);
  await rpc(url, headers, session, "notifications/initialized", {});
  return { session, info: init?.serverInfo || {} };
}

function cleanHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    if (/^[a-z0-9-]{1,60}$/i.test(k) && typeof v === "string" && v.length < 4000 && !/^(host|content-length|cookie)$/i.test(k)) out[k] = v;
  }
  return out;
}

// body: { url, headers?, op: "tools" | "call", name?, args? }
export async function mcpRelay(body) {
  const url = assertPublicUrl(String(body.url || "")).toString();
  const headers = cleanHeaders(body.headers);
  const { session, info } = await open(url, headers);
  if (body.op === "tools") {
    const r = await rpc(url, headers, session, "tools/list", {}, 2);
    return {
      server: info.name || "",
      tools: (r?.tools || []).slice(0, 60).map((t) => ({ name: t.name, description: (t.description || "").slice(0, 600), schema: t.inputSchema || {} })),
    };
  }
  if (body.op === "call") {
    if (!body.name) throw new HttpError(400, "Which tool? Send name.");
    const r = await rpc(url, headers, session, "tools/call", { name: String(body.name), arguments: body.args && typeof body.args === "object" ? body.args : {} }, 2);
    const text = (r?.content || [])
      .map((c) => (c.type === "text" ? c.text : c.type === "resource" ? c.resource?.text || "" : `[${c.type}]`))
      .join("\n")
      .slice(0, 20000);
    return { isError: Boolean(r?.isError), text: text || JSON.stringify(r?.structuredContent || {}).slice(0, 20000) };
  }
  throw new HttpError(400, "op must be tools or call.");
}
