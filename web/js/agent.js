// The agent loop: stream a reply, apply the files it wrote, run the web tools it asked for, repeat.
// Tools are plain-text tags so every model works, including ones without native function calling.
import { state, providerSettings, apiBase, serverHeaders, uid, save, projectOf } from "./store.js";
import { providerById } from "../shared/catalog.js";
import { segments, toolCalls } from "./markdown.js";
import { fileChanges } from "./workspace.js";
import { commitChanges } from "./versions.js";
import { browserCall, serverConfigured } from "./browser.js";
import { activeSkills, skillContent, skillsReady } from "./skills.js";
import { agentSection, mcpSection, callMcp } from "./agents.js";
import { OFFICE_PROMPT } from "./office.js";
import { gmailSection, gmailSearch, gmailRead, gmailDraft } from "./gmail.js";

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
- Use the web for current docs, versions, APIs and errors you are unsure about. Cite the URLs you used.

Context the user can attach:
- Images are screenshots, mockups or sketches: match their layout, spacing and colours closely.
- <selected-element> is an element the user clicked in the live preview: change that element (and only what the request needs around it).
- <mentioned-file> and <mentioned-page> are files and web pages the user pointed you to with @.
- When the user sends preview errors, find the root cause and send the fixed files.`;

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

const MODE_PROMPTS = {
  research: `\n\n## RESEARCH MODE (active)\nResearch thoroughly before answering. Run 3 to 5 diji-search queries from different angles (one per reply turn is fine), read the 2 to 4 most useful sources with diji-browse, then write a structured report: a short answer first, then findings with headings, trade-offs, and a "Sources" list of the URLs you used. Do not write or change files unless the user asked for code.`,
  plan: `\n\n## PLAN MODE (active)\nDo not write or change any files in this reply. Study the request and the workspace, then reply with: a one-line goal, the files you will create or change (and why), the key decisions with your recommendation, and a short numbered build plan. Ask at most one question if something is truly undecided. End with: "Switch to Build and I will make it."`,
  ask: `\n\n## ASK MODE (active)\nAnswer, explain or review only. Do not write or change any files in this reply. Quote short code snippets in normal fenced blocks without file= when they help.`,
};

const EFFORT = {
  low: "\n\nEffort: low. Be quick and concise. Ship the simplest thing that works; skip extras.",
  high: "\n\nEffort: high. Take extra care: think through edge cases, accessibility and responsiveness, double-check your code before sending, and polish the details.",
};
const STYLES = {
  concise: "\n\nResponse style: concise. Keep prose to a few short lines; let the code speak.",
  explanatory: "\n\nResponse style: explanatory. Teach as you go: briefly explain the why behind key decisions so a learner understands the code.",
  formal: "\n\nResponse style: formal. Clear, professional, structured language; no casual phrasing or emoji.",
};

function memorySection() {
  const s = state.settings;
  const lines = [];
  if (s.userName) lines.push(`The user's name is ${s.userName}.`);
  if (s.memoryOn !== false) for (const m of s.memory || []) lines.push(m.text);
  let out = lines.length ? `\n\n## What you know about the user\n${lines.map((l) => "- " + l).join("\n")}` : "";
  if (s.memoryOn !== false) out += `\n\nMemory: when the user shares a lasting preference or fact about themselves or their work (stack, style, name, goals), save it with <diji-remember text="short fact"/>. Never save secrets, keys or passwords.`;
  return out;
}

function projectSection(chat) {
  const p = projectOf(chat);
  if (!p) return "";
  let out = `\n\n## Project: ${p.name}`;
  if (p.instructions?.trim()) out += `\nInstructions (always follow):\n${p.instructions.trim()}`;
  const files = Object.entries(p.files || {});
  let budget = 30000;
  for (const [name, text] of files) {
    const slice = text.slice(0, Math.max(0, budget));
    budget -= slice.length;
    out += `\n\n<project-knowledge name="${name}">\n${slice}\n</project-knowledge>`;
    if (budget <= 0) break;
  }
  return out;
}

// Project rules, like Cline's .clinerules: global ones from Settings, plus a rules file in the workspace.
function rulesSection(chat) {
  const parts = [];
  if (state.settings.rules?.trim()) parts.push(state.settings.rules.trim());
  for (const f of [".dijirules", "AGENTS.md", ".clinerules", ".cursorrules"]) if (chat.files[f]?.trim()) parts.push(`From ${f}:\n${chat.files[f].trim().slice(0, 8000)}`);
  return parts.length ? `\n\n## Project rules (always follow)\n${parts.join("\n\n")}` : "";
}

async function systemPrompt(chat, prompt) {
  await skillsReady();
  const skills = activeSkills(prompt);
  let text = BASE_PROMPT + OFFICE_PROMPT + (MODE_PROMPTS[state.settings.mode] || "") + (EFFORT[state.settings.effort] || "") + (STYLES[state.settings.style] || "") + agentSection(chat) + memorySection() + projectSection(chat) + rulesSection(chat) + mcpSection() + gmailSection();
  if (chat.locked?.length) text += `\n\nLocked files (the user froze these; never rewrite or delete them): ${chat.locked.join(", ")}`;
  if (!serverConfigured()) text += "\n\nNote: the cloud browser is offline right now, so do not use diji-search or diji-browse. Answer from what you know and say when something may be out of date.";
  if (skills.length) {
    const bodies = await Promise.all(skills.map(async (s) => `### Skill: ${s.name}\n${await skillContent(s).catch(() => s.description)}`));
    text += `\n\n## Active skills\nFollow these playbooks where they apply.\n\n${bodies.join("\n\n")}`;
  }
  return { text: text + workspaceSection(chat.files), skills };
}

function apiMessages(chat) {
  const msgs = chat.messages.filter((m) => m.content && !m.error);
  // Only the most recent message with images sends them; older ones keep a short note to save tokens.
  const lastImg = msgs.findLastIndex((m) => m.images?.length);
  return msgs.map((m, i) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    const body = m.role === "assistant" ? m.content.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim() : m.content;
    const text = m.role === "tool" ? m.content : body + (m.attachments || "");
    if (!m.images?.length) return { role, content: text };
    if (i !== lastImg) return { role, content: `${text}\n\n(${m.images.length} image${m.images.length > 1 ? "s" : ""} attached earlier)` };
    return { role, content: [{ type: "text", text }, ...m.images.map((url) => ({ type: "image_url", image_url: { url } }))] };
  });
}

async function stream(chat, system, onText, signal, override) {
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
      messages: override?.messages || apiMessages(chat),
      ...(override?.maxTokens ? { maxTokens: override.maxTokens } : s.effort === "high" ? { maxTokens: 16000 } : s.effort === "low" ? { maxTokens: 4096 } : { maxTokens: 8192 }),
      ...(override?.effort ? { effort: override.effort } : override ? {} : { effort: s.effort }),
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `The model request failed (${res.status}).`);
  }
  stream.lastModel = res.headers.get("x-diji-model") || "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    // Free models sometimes stall mid-reply; after 60s of silence treat it as ended so Diji can continue.
    let idle;
    const next = await Promise.race([reader.read(), new Promise((r) => (idle = setTimeout(() => r({ stalled: true }), 60000)))]);
    clearTimeout(idle);
    if (next.stalled) {
      reader.cancel().catch(() => {});
      break;
    }
    const { value, done } = next;
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

// A continuation sometimes starts by reopening the fence or repeating the file= line; drop that.
function stripReopen(t) {
  return t.replace(/^\s*```[^\n]*\n/, "").replace(/^\s*file=\S+\s*\n/, "");
}

function summarize(tool, args, result) {
  if (tool === "gmail-search") return `<diji-result tool="gmail-search" query="${args.query || ""}">\n${result.map((m) => `- id=${m.id}${m.unread ? " (unread)" : ""} | ${m.date} | ${m.from} | ${m.subject}\n  ${m.snippet}`).join("\n") || "No emails matched."}\n</diji-result>`;
  if (tool === "gmail-read") return `<diji-result tool="gmail-read" id="${result.id}">\nFrom: ${result.from}\nTo: ${result.to}\nDate: ${result.date}\nSubject: ${result.subject}\n\n${result.text}\n</diji-result>`;
  if (tool === "gmail-draft") return `<diji-result tool="gmail-draft">Draft saved in Gmail (id ${result.id}). The user can review and send it from Drafts.</diji-result>`;
  if (tool === "mcp") return `<diji-result tool="mcp" server="${args.server}" name="${args.tool}"${result.isError ? ' error="true"' : ""}>\n${result.text}\n</diji-result>`;
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
  if (tool === "gmail-search") return gmailSearch(args.query, args.max);
  if (tool === "gmail-read") return gmailRead(args.id);
  if (tool === "gmail-draft") return gmailDraft({ to: args.to, subject: args.subject, body: args.input, threadId: args.thread });
  if (tool === "mcp") {
    let input = {};
    if (args.input) {
      try {
        input = JSON.parse(args.input);
      } catch {
        throw new Error("Plugin arguments must be a JSON object.");
      }
    }
    return callMcp(args.server, args.tool, input);
  }
  if (tool === "browse") {
    if (!/^https?:\/\//.test(args.url || "")) throw new Error("Browse needs a full http(s) URL.");
    await browserCall("open", { url: args.url });
    return browserCall("read", { max: 9000 });
  }
  return null;
}

export async function runAgent(chat, { onUpdate, onFiles, onMemory, signal }) {
  const prompt = [...chat.messages].reverse().find((m) => m.role === "user")?.content || "";
  const steps = state.settings.mode === "research" ? 10 : MAX_STEPS;
  for (let step = 0; step < steps; step++) {
    const { text: system, skills } = await systemPrompt(chat, prompt);
    const msg = { id: uid(), role: "assistant", content: "", streaming: true, model: `${state.settings.model.model}`, mode: state.settings.mode || "build", skills: skills.map((s) => s.name) };
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
    // Reasoning models sometimes spend the whole budget thinking: ask once for the answer itself.
    const think = msg.content.indexOf("<think>");
    if (think !== -1 && !msg.content.includes("</think>") && !signal.aborted) {
      const base = msg.content + "</think>";
      try {
        await stream(chat, system, (t) => {
          msg.content = base + t.replace(/<think>[\s\S]*?(<\/think>|$)/g, "");
          onUpdate(msg);
        }, signal, {
          messages: (() => {
            const ms = apiMessages(chat).slice(0, -1);
            const nudge = "\n\n(You already planned this. Do not think out loud any more: write the final answer and the complete files now.)";
            const last = ms.at(-1);
            if (last?.role === "user") ms[ms.length - 1] = { ...last, content: typeof last.content === "string" ? last.content + nudge : [...last.content, { type: "text", text: nudge }] };
            return ms;
          })(),
          effort: "low", // no more thinking on the retry
        });
      } catch {}
    }
    // Long files can hit the model's output limit mid-file: ask it to carry on and stitch the parts.
    for (let more = 0; more < 3 && !signal.aborted; more++) {
      const tail = segments(msg.content).at(-1);
      if (tail?.type !== "file" || tail.done) break;
      const base = msg.content;
      try {
        await stream(chat, system, (t) => {
          msg.content = base + stripReopen(t);
          onUpdate(msg);
        }, signal, {
          messages: [...apiMessages(chat), { role: "user", content: `Your reply was cut off inside ${tail.path}. Continue exactly from the next character. Do not repeat anything, do not add a preamble and do not open a new code fence. Close the fence when ${tail.path} is complete.` }],
          effort: "low",
        });
      } catch {
        break;
      }
      if (msg.content === base) break;
    }
    // Still open after that: close the fence so the work is kept (the preview shows if anything is missing).
    const open = segments(msg.content).at(-1);
    if (open?.type === "file" && !open.done) {
      msg.content += "\n```";
      msg.cutOff = open.path;
    }
    msg.streaming = false;
    if (stream.lastModel) msg.model = stream.lastModel;
    msg.tokens = Math.round(msg.content.length / 4);
    let changed = [];
    const changes = fileChanges(segments(msg.content));
    // A full HTML page in an unnamed block (common with smaller models) becomes index.html.
    if (!Object.keys(changes).length && (state.settings.mode || "build") === "build") {
      const page = msg.content.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").match(/```html?[^\n]*\n([\s\S]*?<\/html>)\s*```/i);
      if (page && /<!doctype html|<html/i.test(page[1])) changes["index.html"] = page[1].trim();
    }
    const count = Object.keys(changes).length;
    if (count && state.settings.mode && state.settings.mode !== "build") {
      msg.ignored = count; // plan/ask replies never touch files
    } else if (count && state.settings.autoApply === false) {
      msg.pending = changes; // review mode: the user applies or rejects
    } else if (count) {
      const r = commitChanges(chat, changes, prompt.replace(/\s+/g, " ") || "Diji's change", msg.id);
      msg.changes = r.summary;
      msg.skipped = r.skipped;
      changed = r.summary.map((x) => x.path);
    }
    if (changed.length) onFiles(changed);
    onUpdate(msg);
    save();

    // Memory saves are applied right away; they are not web tools.
    for (const c of toolCalls(msg.content).filter((c) => c.tool === "remember" && c.args.text)) {
      if (state.settings.memoryOn === false || chat.incognito) continue;
      const text = c.args.text.slice(0, 200);
      if (!state.settings.memory.some((m) => m.text.toLowerCase() === text.toLowerCase())) {
        state.settings.memory.push({ id: uid(), text, at: Date.now() });
        save();
        onMemory?.(text);
      }
    }
    const calls = toolCalls(msg.content).filter((c) => ["search", "browse", "mcp", "gmail-search", "gmail-read", "gmail-draft"].includes(c.tool)).slice(0, MAX_TOOLS_PER_STEP);
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

// Prompt enhancer (bolt.diy-style): turns a rough idea into a specific build prompt.
export async function enhancePrompt(text, signal) {
  const out = await stream(
    { messages: [] },
    "You rewrite a user's rough request for a coding agent into one clear, specific prompt. Keep their intent and language. Add concrete details the agent needs: purpose, key screens or features, look and feel, tech choice (prefer plain HTML/CSS/JS unless they named a stack), and must-haves like responsive layout. Reply with only the improved prompt, no preamble, no quotes, under 120 words.",
    () => {},
    signal,
    { messages: [{ role: "user", content: text }], maxTokens: 400 },
  );
  if (out.includes("<diji-error>")) throw new Error(out.replace(/[\s\S]*<diji-error>|<\/diji-error>[\s\S]*/g, ""));
  return out.trim().replace(/^["“]|["”]$/g, "");
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
