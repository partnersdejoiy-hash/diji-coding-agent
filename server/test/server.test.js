// Run: cd server && npm test   (needs `npm run setup` once for Chromium)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isPrivateHost } from "../../web/api/_lib/llm.js";

const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
let fake, server, fakeUrl;

before(async () => {
  // Fake OpenAI-compatible model that streams "Hello from Diji".
  fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url.endsWith("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ data: [{ id: "fake-b" }, { id: "fake-a" }] }));
      }
      const j = JSON.parse(body);
      if (req.headers.authorization !== "Bearer test-key") {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "bad key sk-abcdefghijklmnop" } }));
      }
      assert.equal(j.messages[0].role, "system");
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const w of ["Hello", " from", " Diji"]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  fakeUrl = `http://127.0.0.1:${fake.address().port}/v1`;
  server = spawn(process.execPath, [fileURLToPath(new URL("../index.js", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), ALLOW_LOCAL_LLM: "1" },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});

after(() => {
  server?.kill();
  fake?.close();
});

const post = (path, body) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("streams a chat answer through a custom OpenAI-compatible endpoint", async () => {
  const res = await post("/api/chat", {
    provider: "custom", baseUrl: fakeUrl, apiKey: "test-key", model: "fake",
    system: "be nice", messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "Hello from Diji");
});

test("bad key gives a readable error with the secret redacted", async () => {
  const res = await post("/api/chat", { provider: "custom", baseUrl: fakeUrl, apiKey: "nope", model: "fake", messages: [{ role: "user", content: "hi" }] });
  assert.equal(res.status, 401);
  const { error } = await res.json();
  assert.match(error, /Check the API key/);
  assert.doesNotMatch(error, /abcdefghijklmnop/);
});

test("missing key for a hosted provider is rejected before any upstream call", async () => {
  const res = await post("/api/chat", { provider: "openai", model: "gpt-5.4", messages: [{ role: "user", content: "hi" }] });
  assert.equal(res.status, 401);
  assert.match((await res.json()).error, /OpenAI API key/);
});

test("lists models from the provider", async () => {
  const res = await post("/api/models", { provider: "custom", baseUrl: fakeUrl, apiKey: "test-key" });
  assert.deepEqual((await res.json()).models, ["fake-a", "fake-b"]);
});

test("private hosts are detected", () => {
  for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.1", "172.20.0.1", "[::1]", "2130706433", "metadata.google.internal"])
    assert.equal(isPrivateHost(h), true, h);
  for (const h of ["example.com", "8.8.8.8", "api.openai.com", "172.32.0.1"]) assert.equal(isPrivateHost(h), false, h);
});

test("cloud browser refuses the cloud metadata address", async () => {
  const res = await post("/api/browser/open", { sessionId: "test-session-1", url: "http://169.254.169.254/latest/meta-data" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /private/);
});

test("cloud browser renders a page and returns a screenshot", async () => {
  const res = await post("/api/browser/open", { sessionId: "test-session-2", url: "data:text/html,<h1>Diji browser works</h1>" });
  const j = await res.json();
  assert.equal(res.status, 200, j.error);
  assert.ok(j.shot.length > 1000);
  const read = await (await post("/api/browser/read", { sessionId: "test-session-2" })).json();
  assert.match(read.text, /Diji browser works/);
});
