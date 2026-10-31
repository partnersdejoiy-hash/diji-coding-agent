// Server-side LLM proxy. Keys arrive per request from the user's browser (bring your own key)
// and are only forwarded to the provider they belong to. Nothing is logged or stored.
import { providerById } from "../../shared/catalog.js";

const env = (k) => (typeof process !== "undefined" ? process.env[k] : undefined);

// Free tier: an operator-configured endpoint wins, otherwise public keyless endpoints in order.
function freeTargets(model) {
  const base = env("DIJI_FREE_BASE_URL");
  if (base) {
    // DIJI_FREE_MODEL may list several models, tried in order (free routes get rate limited).
    const models = (env("DIJI_FREE_MODEL") || model).split(",").map((m) => m.trim()).filter(Boolean);
    // A model the person picked from the server's list goes first; "auto" keeps the server's order.
    if (models.includes(model)) models.unshift(...models.splice(models.indexOf(model), 1));
    return models.map((m) => ({ kind: "openai", baseUrl: base, apiKey: env("DIJI_FREE_API_KEY") || "", model: m }));
  }
  return [
    { kind: "openai", baseUrl: "https://text.pollinations.ai/openai", chatPath: "", apiKey: "", model },
    { kind: "openai", baseUrl: "https://gen.pollinations.ai/v1", apiKey: env("POLLINATIONS_KEY") || "", model },
  ];
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Blocks the proxy from being used to reach the host it runs on or its private network.
// shortcut: checks the hostname literal only, not DNS; set ALLOW_LOCAL_LLM=1 for self-hosted models on a trusted box.
export function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, "That base URL is not a valid URL.");
  }
  if (env("ALLOW_LOCAL_LLM") === "1") return u;
  if (u.protocol !== "https:") throw new HttpError(400, "Base URL must use https. Local http models need ALLOW_LOCAL_LLM=1 on your Diji server.");
  if (isPrivateHost(u.hostname)) throw new HttpError(400, "Private and local addresses are blocked. Set ALLOW_LOCAL_LLM=1 on a self-hosted Diji server to use them.");
  return u;
}

export function isPrivateHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.includes(":")) return h === "::1" || h === "::" || /^(fc|fd|fe8|fe9|fea|feb|::ffff:)/.test(h);
  return (
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") ||
    /^\d+$/.test(h) || // decimal-encoded IPv4 like http://2130706433
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h)
  );
}

export function resolveTargets({ provider, model, apiKey, baseUrl, kind }) {
  const p = providerById(provider);
  if (!p) throw new HttpError(400, `Unknown provider "${provider}".`);
  if (!model || typeof model !== "string") throw new HttpError(400, "Pick a model first.");
  if (p.id === "diji-free") return freeTargets(model);
  const base = (p.custom ? baseUrl : p.baseUrl) || "";
  if (!base) throw new HttpError(400, `${p.name} needs a base URL. Add it in Settings → Models.`);
  if (p.custom) assertPublicUrl(base);
  if (!p.keyless && !p.custom && !apiKey) throw new HttpError(401, `Add your ${p.name} API key in Settings → Models.`);
  const k = p.allowKind && kind === "anthropic" ? "anthropic" : p.kind;
  return [{ kind: k, baseUrl: base, apiKey: apiKey || "", model }];
}

const trimSlash = (s) => s.replace(/\/+$/, "");

// Yields each `data:` payload of a server-sent-events stream.
async function* sseData(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
  if (buf.startsWith("data:")) yield buf.slice(5).trim();
}

async function connect(url, init) {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new HttpError(502, `Could not connect to ${new URL(url).hostname}. Check the base URL or try another model.`);
  }
}

async function upstreamError(res, label) {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = j.error?.message || j.message || j.error || text;
    } catch {
      detail = text;
    }
  } catch {}
  detail = String(detail).replace(/(sk|pk|gsk|xai|key)[-_][A-Za-z0-9_-]{8,}/g, "[redacted]").slice(0, 300);
  const hint =
    res.status === 401 || res.status === 403 ? " Check the API key." :
    res.status === 404 ? " Check the model name and base URL." :
    res.status === 429 ? " Rate limited, wait a moment or switch model." : "";
  return new HttpError(res.status >= 500 ? 502 : res.status, `${label} answered ${res.status}.${hint}${detail ? " " + detail : ""}`);
}

async function* streamOpenAI(t, { system, messages, temperature, maxTokens, effort }, signal) {
  const url = trimSlash(t.baseUrl) + (t.chatPath ?? "/chat/completions");
  const headers = { "content-type": "application/json" };
  if (t.apiKey) headers.authorization = `Bearer ${t.apiKey}`;
  if (url.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = "https://github.com/partnersdejoiy-hash/diji-coding-agent";
    headers["X-Title"] = "Diji Coding Agent";
  }
  const payload = {
    model: t.model,
    stream: true,
    temperature,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    // Only OpenAI's own reasoning models accept this; other endpoints would reject an unknown field.
    ...(effort && url.includes("api.openai.com") && /^(o\d|gpt-5)/.test(t.model) ? { reasoning_effort: effort } : {}),
    // OpenRouter: free models tend to think until the output budget is gone, so thinking is off
    // unless effort is high. Models that cannot turn it off get the lowest effort instead (below).
    ...(url.includes("openrouter.ai") ? { reasoning: effort === "high" ? { effort: "low" } : { enabled: false } } : {}),
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
  };
  const send = () => connect(url, { method: "POST", headers, signal, body: JSON.stringify(payload) });
  let res = await send();
  if (res.status === 400 && payload.reasoning?.enabled === false && /reasoning/i.test(await res.clone().text())) {
    payload.reasoning = { effort: "low" }; // "Reasoning is mandatory for this endpoint"
    res = await send();
  }
  if (!res.ok || !res.body) throw await upstreamError(res, new URL(url).hostname);
  const type = res.headers.get("content-type") || "";
  if (!type.includes("event-stream")) {
    // Some endpoints ignore stream:true and reply with one JSON body.
    const j = await res.json();
    const text = j.choices?.[0]?.message?.content ?? "";
    if (text) yield text;
    return;
  }
  let thinking = false;
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.error) throw new HttpError(502, j.error.message || "The model stopped with an error.");
    const delta = j.choices?.[0]?.delta || {};
    // DeepSeek, OpenRouter and others stream reasoning separately; wrap it so the UI can fold it.
    const reasoning = delta.reasoning_content || delta.reasoning;
    if (typeof reasoning === "string" && reasoning) {
      if (!thinking) yield "<think>";
      thinking = true;
      yield reasoning;
    }
    if (delta.content) {
      if (thinking) yield "</think>\n\n";
      thinking = false;
      yield delta.content;
    }
  }
  if (thinking) yield "</think>";
}

async function* streamAnthropic(t, { system, messages, temperature, maxTokens }, signal) {
  const url = trimSlash(t.baseUrl) + "/messages";
  const res = await connect(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": t.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: t.model,
      max_tokens: maxTokens || 8192,
      temperature,
      stream: true,
      ...(system ? { system } : {}),
      messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: toAnthropic(m.content) })),
    }),
  });
  if (!res.ok || !res.body) throw await upstreamError(res, "Anthropic");
  for await (const data of sseData(res.body)) {
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.type === "error") throw new HttpError(502, j.error?.message || "Claude stopped with an error.");
    if (j.type === "content_block_delta" && j.delta?.type === "text_delta") yield j.delta.text;
    if (j.type === "message_stop") return;
  }
}

// Content is a string, or OpenAI-style parts: {type:"text",text} and {type:"image_url",image_url:{url}}.
function cleanContent(c) {
  if (typeof c === "string") return c.slice(0, 200_000);
  if (!Array.isArray(c)) return null;
  const parts = [];
  for (const p of c.slice(0, 8)) {
    if (p?.type === "text" && typeof p.text === "string") parts.push({ type: "text", text: p.text.slice(0, 200_000) });
    const url = p?.type === "image_url" && p.image_url?.url;
    if (typeof url === "string" && (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(url) || /^https:\/\//.test(url))) parts.push({ type: "image_url", image_url: { url } });
  }
  return parts.length ? parts : null;
}

const asParts = (c) => (typeof c === "string" ? [{ type: "text", text: c }] : c);

function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new HttpError(400, "No messages to send.");
  const out = [];
  for (const m of messages.slice(-60)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const content = cleanContent(m.content);
    if (content === null) continue;
    const last = out[out.length - 1];
    // Anthropic rejects two turns in a row from the same role, so merge them.
    if (last && last.role === m.role) {
      last.content = typeof last.content === "string" && typeof content === "string" ? last.content + "\n\n" + content : [...asParts(last.content), ...asParts(content)];
    } else out.push({ role: m.role, content });
  }
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: "(conversation start)" });
  return out;
}

// Anthropic wants {type:"image", source:{...}} instead of image_url parts.
function toAnthropic(content) {
  if (typeof content === "string") return content;
  return content.map((p) => {
    if (p.type === "text") return p;
    const url = p.image_url.url;
    const m = url.match(/^data:(image\/[\w+.-]+);base64,(.*)$/);
    return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : { type: "image", source: { type: "url", url } };
  });
}

// Streams plain text. Tries each target in order until one starts answering.
export async function* streamChat(body, signal) {
  const targets = resolveTargets(body);
  const req = {
    system: typeof body.system === "string" ? body.system.slice(0, 120_000) : "",
    messages: cleanMessages(body.messages),
    temperature: Number.isFinite(body.temperature) ? Math.min(Math.max(body.temperature, 0), 2) : 0.4,
    maxTokens: Number.isInteger(body.maxTokens) ? Math.min(body.maxTokens, 64_000) : undefined,
    effort: ["low", "medium", "high"].includes(body.effort) ? body.effort : undefined,
  };
  let lastErr;
  for (const t of targets) {
    const gen = t.kind === "anthropic" ? streamAnthropic(t, req, signal) : streamOpenAI(t, req, signal);
    let started = false;
    try {
      for await (const piece of gen) {
        started = true;
        body.usedModel = t.model; // which model answered (free tier falls back between several)
        yield piece;
      }
      if (started) return;
      lastErr = new HttpError(502, "The model returned an empty answer.");
    } catch (e) {
      if (started || signal?.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new HttpError(502, "No model answered.");
}

export async function listModels(body) {
  if (body.provider === "diji-free" && env("DIJI_FREE_BASE_URL")) return ["auto", ...(env("DIJI_FREE_MODEL") || "").split(",").map((m) => m.trim()).filter(Boolean)];
  const [t] = resolveTargets({ ...body, model: body.model || "probe" });
  const headers = {};
  let url;
  if (t.kind === "anthropic") {
    url = trimSlash(t.baseUrl) + "/models?limit=100";
    headers["x-api-key"] = t.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    url = t.baseUrl.includes("pollinations.ai") ? "https://text.pollinations.ai/models" : trimSlash(t.baseUrl) + "/models";
    if (t.apiKey) headers.authorization = `Bearer ${t.apiKey}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw await upstreamError(res, new URL(url).hostname);
  const j = await res.json();
  const list = Array.isArray(j) ? j : j.data || j.models || [];
  return [...new Set(list.map((m) => (typeof m === "string" ? m : m.id || m.name)).filter(Boolean))].sort();
}
