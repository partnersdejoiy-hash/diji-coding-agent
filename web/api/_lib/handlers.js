// Web-standard (Request -> Response) handlers, used as Vercel functions and by the Oracle server.
import { streamChat, listModels, HttpError } from "./llm.js";
import { deployWorkspace } from "./deploy.js";

const MAX_BODY = 4_000_000; // room for a few compressed screenshots

export function corsHeaders(request) {
  const allowed = (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim());
  const origin = request.headers.get("origin") || "";
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-diji-token",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export const json = (request, status, data) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...corsHeaders(request) } });

async function readJson(request, max = MAX_BODY) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "That message is too large. Attach smaller files.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
}

export async function chatHandler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "Use POST." });
  let gen, first;
  try {
    const body = await readJson(request);
    gen = streamChat(body, request.signal);
    // Pull the first piece before answering so setup errors become a clean JSON error, not a broken stream.
    first = await gen.next();
  } catch (e) {
    return json(request, e.status || 500, { error: e.status ? e.message : "Diji could not reach the model. Try again." });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(enc.encode(first.value));
        for await (const piece of gen) controller.enqueue(enc.encode(piece));
      } catch (e) {
        if (!request.signal?.aborted) controller.enqueue(enc.encode(`\n\n<diji-error>${e.message || "The stream broke."}</diji-error>`));
      }
      controller.close();
    },
    cancel() {
      gen.return?.();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no", ...corsHeaders(request) },
  });
}

export async function deployHandler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "Use POST." });
  try {
    return json(request, 200, await deployWorkspace(await readJson(request, 6_000_000)));
  } catch (e) {
    return json(request, e.status || 500, { error: e.status ? e.message : "Deploy failed. Try again." });
  }
}

export async function modelsHandler(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, 405, { error: "Use POST." });
  try {
    const body = await readJson(request);
    return json(request, 200, { models: await listModels(body) });
  } catch (e) {
    return json(request, e.status || 500, { error: e.status ? e.message : "Could not list models." });
  }
}
