// The agent loop: stream a reply, apply the files it wrote, run the web tools it asked for, repeat.
// Tools are plain-text tags so every model works, including ones without native function calling.
import { state, providerSettings, apiBase, serverHeaders, uid, save } from "./store.js";
import { providerById } from "../shared/catalog.js";
import { segments, toolCalls } from "./markdown.js";
import { applyFiles } from "./workspace.js";
import { browserCall, serverConfigured } from "./browser.js";
import { activeSkills, skillContent } from "./skills.js";

const MAX_STEPS = 6;
const MAX_TOOLS_PER_STEP = 3;
const WORKSPACE_BUDGET = 40000;

const BASE_PROMPT = `You are Diji, a joyful, sharp coding agent made by Dejoiy. You build real, working software with the user.

How you work:
- Lead with the result. Be warm and brief in prose; put the effort into the code.
- Ask one question only when a wrong guess would waste real work. Otherwise make a sensible choice and say which.
- Write complete, runnable code. Never leave placeholders, "rest of code" comments or TODO stubs.
- Prefer the simplest solution that fully works. No dependencies you do not need.

Writing files (the user's workspace):
- Put every file in its own fenced block and name it in the info string, like:
\`\`\`html file=index.html
<!doctype html>...
\`\`\`
- Always send the whole file, even when changing one line. The workspace keeps the latest version.
- For web apps, write index.html plus any style.css / app.js it links. The user sees a live preview instantly. Prefer plain HTML, CSS and JavaScript (ES modules, CDN imports allowed) so the preview runs without a build step.
- To delete a file: <diji-delete path="old.js"/>

Using the web (cloud browser):
- Search: <diji-search query="vite env variables docs"/>
- Read a page: <diji-browse url="https://example.com/docs"/>
- After a tool tag, stop writing. The result arrives in the next message, then continue.
- Use the web for current docs, versions, APIs and errors you are unsure about. Cite the URLs you used.`;

function workspaceSection(files) {
  const paths = Object.keys(files);
  if (!paths.length) return "";
  let used = 0;
  const blocks = [];
  for (const p of paths) {
    const c = files[p];
    if (used + c.length > WORKSPACE_BUDGET) {
      blocks.push(`- ${p} (${c.length} chars, not shown: ask to see it or rewrite it fully)`);
      continue;
    }
    used += c.length;
    blocks.push(`\`\`\`text path-ref=${p}\n${c}\n\`\`\``);
  }
  return `\n\nCurrent workspace files (edit by re-sending the whole file with file=path):\n${blocks.join("\n")}`;
}

async function systemPrompt(chat, prompt) {
  const skills = activeSkills(prompt);
  let text = BASE_PROMPT;
  if (!serverConfigured()) text += "\n\nNote: the cloud browser is offline right now, so do not use diji-search or diji-browse. Answer from what you know and say when something may be out of date.";
  if (skills.length) {
    const bodies = await Promise.all(skills.map(async (s) => `### Skill: ${s.name}\n${await skillContent(s).catch(() => s.description)}`));
    text += `\n\n## Active skills\nFollow these playbooks where they apply.\n\n${bodies.join("\n\n")}`;
  }
  return { text: text + workspaceSection(chat.files), skills };
}

function apiMessages(chat) {
  return chat.messages
    .filter((m) => m.content && !m.error)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.role === "tool" ? m.content : m.content + (m.attachments || "") }));
}

async function stream(chat, system, onText, signal) {
  const s = state.settings;
  const p = providerById(s.model.provider);
  const ps = providerSettings(s.model.provider);
  const res = await fetch(apiBase() + "/api/chat", {
    method: "POST",
    headers: apiBase() ? serverHeaders() : { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      provider: s.model.provider,
      model: s.model.model,
      apiKey: ps.key || "",
      baseUrl: p?.custom ? ps.baseUrl || p.baseUrl : undefined,
      kind: ps.kind,
      temperature: s.temperature,
      system,
      messages: apiMessages(chat),
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `The model request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

function summarize(tool, args, result) {
  if (tool === "search") {
    const lines = result.links.slice(0, 10).map((l, i) => `${i + 1}. ${l.text} — ${l.href}`);
    return `<diji-result tool="search" query="${args.query}">\n${lines.join("\n") || result.text.slice(0, 3000)}\n</diji-result>`;
  }
  return `<diji-result tool="browse" url="${result.url}" title="${(result.title || "").replace(/"/g, "'")}">\n${result.text.slice(0, 7000)}\n</diji-result>`;
}

async function runTool(call) {
  const { tool, args } = call;
  if (tool === "search") {
    if (!args.query) throw new Error("Search needs a query.");
    await browserCall("search", { query: args.query });
    return browserCall("read", { max: 6000 });
  }
  if (tool === "browse") {
    if (!/^https?:\/\//.test(args.url || "")) throw new Error("Browse needs a full http(s) URL.");
    await browserCall("open", { url: args.url });
    return browserCall("read", { max: 9000 });
  }
  return null;
}

export async function runAgent(chat, { onUpdate, onFiles, signal }) {
  const prompt = [...chat.messages].reverse().find((m) => m.role === "user")?.content || "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const { text: system, skills } = await systemPrompt(chat, prompt);
    const msg = { id: uid(), role: "assistant", content: "", streaming: true, model: `${state.settings.model.model}`, skills: skills.map((s) => s.name) };
    chat.messages.push(msg);
    onUpdate(msg);
    try {
      await stream(chat, system, (t) => {
        msg.content = t;
        onUpdate(msg);
      }, signal);
    } catch (e) {
      msg.streaming = false;
      if (signal.aborted) {
        msg.stopped = true;
        if (!msg.content) chat.messages.pop();
        onUpdate(msg);
        return { stopped: true };
      }
      msg.error = e.message;
      onUpdate(msg);
      throw e;
    }
    msg.streaming = false;
    const segs = segments(msg.content);
    const changed = applyFiles(chat, segs);
    if (changed.length) onFiles(changed);
    onUpdate(msg);
    save();

    const calls = toolCalls(msg.content).filter((c) => c.tool !== "delete").slice(0, MAX_TOOLS_PER_STEP);
    if (!calls.length || signal.aborted) return { files: changed };
    for (const call of calls) {
      const tm = { id: uid(), role: "tool", tool: call.tool, args: call.args, content: "", pending: true };
      chat.messages.push(tm);
      onUpdate(tm);
      try {
        const result = await runTool(call);
        tm.content = summarize(call.tool, call.args, result);
        tm.shot = result.shot;
        tm.url = result.url;
        tm.title = result.title;
      } catch (e) {
        tm.content = `<diji-result tool="${call.tool}" error="true">${e.message}</diji-result>`;
        tm.failed = e.message;
      }
      tm.pending = false;
      onUpdate(tm);
    }
    save();
  }
  return {};
}

// Quick connectivity check used by Settings → Test.
export async function testModel(providerId, model) {
  const p = providerById(providerId);
  const ps = providerSettings(providerId);
  const res = await fetch(apiBase() + "/api/chat", {
    method: "POST",
    headers: apiBase() ? serverHeaders() : { "content-type": "application/json" },
    body: JSON.stringify({
      provider: providerId,
      model,
      apiKey: ps.key || "",
      baseUrl: p?.custom ? ps.baseUrl || p.baseUrl : undefined,
      kind: ps.kind,
      messages: [{ role: "user", content: "Reply with exactly: Diji is connected" }],
      maxTokens: 20,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
  const text = await res.text();
  if (text.includes("<diji-error>")) throw new Error(text.replace(/[\s\S]*<diji-error>|<\/diji-error>[\s\S]*/g, ""));
  return text.trim().slice(0, 80);
}

export async function fetchModels(providerId) {
  const p = providerById(providerId);
  const ps = providerSettings(providerId);
  const res = await fetch(apiBase() + "/api/models", {
    method: "POST",
    headers: apiBase() ? serverHeaders() : { "content-type": "application/json" },
    body: JSON.stringify({ provider: providerId, apiKey: ps.key || "", baseUrl: p?.custom ? ps.baseUrl || p.baseUrl : undefined, kind: ps.kind }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
  return j.models;
}
