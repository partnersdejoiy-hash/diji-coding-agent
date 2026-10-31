// Agents (LobeHub-style): ready-made and custom personas with their own instructions and starters.
// Plugins: remote MCP servers (Streamable HTTP) whose tools Diji can call during a reply.
import { state, save, uid, apiBase, serverHeaders } from "./store.js";
import { icon } from "./icons.js";
import { esc } from "./markdown.js";
import { toast } from "./notify.js";

export const BUILTIN_AGENTS = [
  {
    id: "ui-designer", name: "UI Designer", icon: "palette", tone: "pink",
    description: "Polished, responsive interfaces with real taste. No generic AI look.",
    prompt: "You are a senior product designer who codes. Every UI you build has a clear visual idea, a deliberate type scale, generous spacing, real hover/focus/empty/loading states, and works from 320px phones to wide desktops. Avoid generic purple gradients, emoji icons and centered-everything layouts. Use semantic HTML and accessible contrast.",
    starters: ["Design a pricing page for a student SaaS", "Make my portfolio look premium", "Build a dark-mode dashboard for a gym"],
  },
  {
    id: "bug-hunter", name: "Bug Hunter", icon: "bug", tone: "blue",
    description: "Finds the root cause, fixes it, and explains it in one line.",
    prompt: "You are a debugging specialist. Reproduce the problem from what the user gives you, find the root cause (not the symptom), fix it with the smallest correct change, and say in one sentence what was wrong. If information is missing, ask for the exact error message or the failing input.",
    starters: ["My fetch call returns CORS errors", "Why is my React state not updating?", "Fix the errors in my preview"],
  },
  {
    id: "reviewer", name: "Code Reviewer", icon: "shield", tone: "ink",
    description: "Reviews code for bugs, security and simplicity, ranked by severity.",
    prompt: "You review code like a careful staff engineer. Report real problems only, most severe first: bugs, security holes, data loss, then needless complexity. For each, give the file, the line, what breaks and the fix. Do not rewrite files unless asked.",
    starters: ["Review the code in my workspace", "Is this login flow secure?", "What would you simplify here?"],
  },
  {
    id: "interview-coach", name: "Interview Coach", icon: "target", tone: "pink",
    description: "Mock coding and system design interviews with honest feedback.",
    prompt: "You are a friendly but honest tech interview coach for students and junior engineers. Run mock interviews one question at a time, wait for the answer, then give specific feedback and a better answer. Cover DSA, projects, system design basics and HR questions. Adapt difficulty to how the user does.",
    starters: ["Mock interview for a frontend role", "Ask me 5 DSA questions on arrays", "How do I present my project in an interview?"],
  },
  {
    id: "python-tutor", name: "Python Tutor", icon: "graduation", tone: "blue",
    description: "Teaches Python step by step with runnable examples.",
    prompt: "You teach Python to beginners and intermediate learners. Explain one idea at a time with a tiny runnable example, then a short exercise. Check their answers kindly and precisely.",
    starters: ["Teach me list comprehensions", "Explain classes like I'm new", "Give me a small project to practise"],
  },
  {
    id: "data-sql", name: "Data & SQL", icon: "table", tone: "ink",
    description: "SQL queries, data cleaning and charts from your CSVs.",
    prompt: "You are a data analyst. Write correct SQL (say which dialect), explain joins and window functions simply, and when the user attaches data, analyse it and build a chart page with plain HTML and a CDN chart library.",
    starters: ["Write SQL for top 5 customers by revenue", "Chart this CSV for me", "Explain window functions"],
  },
  {
    id: "docs-writer", name: "Docs Writer", icon: "book", tone: "blue",
    description: "READMEs, API docs and project reports that people actually read.",
    prompt: "You write clear technical documentation: READMEs with a one-line pitch, quick start, features, screenshots placeholders the user fills, and usage. Use short sentences and real commands. Write files as README.md or docs/*.md.",
    starters: ["Write a README for my workspace", "Document this API", "Write my final-year project report outline"],
  },
  {
    id: "startup-mentor", name: "Startup Mentor", icon: "rocket", tone: "pink",
    description: "Turns an idea into an MVP plan, landing page and pitch.",
    prompt: "You are a pragmatic startup mentor for Indian student founders. Sharpen the idea into one target user and one problem, propose the smallest MVP, then help build its landing page and a 10-slide pitch outline. Be direct about risks.",
    starters: ["I have an idea for a campus food app", "Make a landing page for my startup", "Outline my pitch deck"],
  },
  {
    id: "email", name: "Email Assistant", icon: "mail", tone: "blue",
    description: "Reads your Gmail, summarises what matters and drafts replies.",
    prompt: "You are a calm, efficient email assistant. Use the Gmail tools to find and read the emails the user means. Summarise in short bullets: who, what they need, by when. Draft replies in the user's voice, short and polite, and save them as Gmail drafts only when asked. If Gmail is not connected, tell the user to connect it in Settings → Gmail.",
    starters: ["Summarise my unread emails from today", "Any emails about interviews this week?", "Draft a polite follow-up to the last recruiter email"],
  },
  {
    id: "hinglish", name: "Hinglish Explainer", icon: "chat", tone: "ink",
    description: "Explains code and concepts in simple Hinglish.",
    prompt: "Always reply in friendly, simple Hinglish (Hindi written in Latin script mixed with English technical words). Explain code and concepts with desi examples, short paragraphs, and keep code and file names in English.",
    starters: ["Promise kya hota hai samjhao", "Mere code ko line by line samjhao", "API aur backend ka difference"],
  },
];

export const allAgents = () => [...(state.settings.agents || []), ...BUILTIN_AGENTS];
export const agentOf = (chat) => (chat?.agentId ? allAgents().find((a) => a.id === chat.agentId) || null : null);

export function agentSection(chat) {
  const a = agentOf(chat);
  return a ? `\n\n## You are acting as the "${a.name}" agent\n${a.prompt}` : "";
}

/* ---------- MCP plugins ---------- */

export const SUGGESTED_MCP = [
  { name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", note: "Ask questions about any public GitHub repo" },
  { name: "Context7", url: "https://mcp.context7.com/mcp", note: "Up-to-date docs for thousands of libraries" },
];

const servers = () => (state.settings.mcp ||= []);
export const enabledServers = () => servers().filter((s) => s.enabled && s.tools?.length);

async function relay(body) {
  const res = await fetch(apiBase() + "/api/mcp", {
    method: "POST",
    headers: apiBase() ? serverHeaders() : { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Plugin request failed (${res.status}).`);
  return j;
}

const headersOf = (s) => (s.token ? { authorization: /^bearer /i.test(s.token) ? s.token : `Bearer ${s.token}` } : {});

export async function connectServer(s) {
  const r = await relay({ op: "tools", url: s.url, headers: headersOf(s) });
  s.tools = r.tools;
  s.label = r.server || s.name;
  s.checked = Date.now();
  save();
  return s;
}

export async function callMcp(serverName, tool, args) {
  const s = servers().find((x) => x.enabled && x.name.toLowerCase() === String(serverName || "").toLowerCase());
  if (!s) throw new Error(`No enabled plugin called "${serverName}".`);
  if (!s.tools?.some((t) => t.name === tool)) throw new Error(`The ${s.name} plugin has no tool "${tool}".`);
  return relay({ op: "call", url: s.url, headers: headersOf(s), name: tool, args });
}

function paramsOf(schema) {
  const props = schema?.properties || {};
  const req = new Set(schema?.required || []);
  return Object.entries(props)
    .slice(0, 8)
    .map(([k, v]) => `${k}${req.has(k) ? "" : "?"}: ${v.type || "any"}`)
    .join(", ");
}

export function mcpSection() {
  const list = enabledServers();
  if (!list.length) return "";
  let out = `\n\n## Plugins (MCP tools)\nCall a plugin tool with a JSON object of arguments, then stop and wait for the result:\n<diji-mcp server="SERVER" tool="TOOL">{"arg": "value"}</diji-mcp>\nAvailable:`;
  let budget = 6000;
  for (const s of list) {
    for (const t of s.tools) {
      const line = `\n- server="${s.name}" tool="${t.name}" (${paramsOf(t.schema)}): ${t.description.split("\n")[0].slice(0, 160)}`;
      if ((budget -= line.length) < 0) break;
      out += line;
    }
  }
  return out;
}

/* ---------- pages ---------- */

const TONES = { pink: "var(--pink-tint)", blue: "var(--blue-tint)", ink: "var(--surface-3)" };

export function renderAgents(el, h) {
  const custom = state.settings.agents || [];
  const card = (a, mine) => `<article class="agent-card">
      <span class="agent-ic" style="background:${TONES[a.tone] || TONES.pink}">${icon(a.icon || "sparkles", 18)}</span>
      <strong>${esc(a.name)}</strong>
      <p class="muted">${esc(a.description || "")}</p>
      <div class="agent-acts">
        <button type="button" class="btn-primary sm" data-chat-agent="${a.id}">${icon("chat", 14)} Chat</button>
        ${mine ? `<button type="button" class="btn-ghost sm" data-edit-agent="${a.id}">${icon("pencil", 14)} Edit</button>` : `<button type="button" class="btn-ghost sm" data-copy-agent="${a.id}">${icon("copy", 14)} Customise</button>`}
      </div></article>`;
  el.innerHTML = `<div class="page-inner">
    <header class="page-head"><h2>Agents</h2>
      <div class="btn-row"><label class="btn-ghost sm">${icon("upload", 14)} Import<input type="file" accept="application/json" hidden data-import-agent></label>
      <button type="button" class="btn-primary" data-new-agent>${icon("plus", 16)} New agent</button></div></header>
    <p class="muted page-sub">Specialists with their own instructions. Pick one and every message in that chat follows its playbook.</p>
    ${custom.length ? `<h3 class="page-h3">Your agents</h3><div class="agent-grid">${custom.map((a) => card(a, true)).join("")}</div><h3 class="page-h3">Diji agents</h3>` : ""}
    <div class="agent-grid">${BUILTIN_AGENTS.map((a) => card(a, false)).join("")}</div>
  </div>`;
  el.querySelectorAll("[data-chat-agent]").forEach((b) => (b.onclick = () => h.chatWith(b.dataset.chatAgent)));
  el.querySelectorAll("[data-edit-agent]").forEach((b) => (b.onclick = () => openAgentEditor(custom.find((a) => a.id === b.dataset.editAgent), () => renderAgents(el, h))));
  el.querySelectorAll("[data-copy-agent]").forEach((b) => (b.onclick = () => {
    const src = BUILTIN_AGENTS.find((a) => a.id === b.dataset.copyAgent);
    openAgentEditor({ ...src, id: "", name: `${src.name} (mine)` }, () => renderAgents(el, h));
  }));
  el.querySelector("[data-new-agent]").onclick = () => openAgentEditor(null, () => renderAgents(el, h));
  el.querySelector("[data-import-agent]").onchange = async (e) => {
    try {
      const a = JSON.parse(await e.target.files[0].text());
      if (!a.name || !a.prompt) throw new Error();
      (state.settings.agents ||= []).unshift(cleanAgent({ ...a, id: uid() }));
      save();
      renderAgents(el, h);
      toast(`Imported “${a.name}”.`, "success", { keep: false });
    } catch {
      toast("That file is not a Diji agent.", "error", { keep: false });
    }
  };
}

const cleanAgent = (a) => ({
  id: a.id || uid(),
  name: String(a.name || "Untitled agent").slice(0, 50),
  icon: a.icon || "sparkles",
  tone: ["pink", "blue", "ink"].includes(a.tone) ? a.tone : "pink",
  description: String(a.description || "").slice(0, 160),
  prompt: String(a.prompt || "").slice(0, 8000),
  starters: (a.starters || []).map((s) => String(s).slice(0, 120)).filter(Boolean).slice(0, 4),
});

function openAgentEditor(agent, done) {
  const d = document.getElementById("help-modal");
  const a = agent || { name: "", description: "", prompt: "", starters: [], tone: "pink", icon: "sparkles" };
  const ICONS = ["sparkles", "palette", "bug", "shield", "target", "graduation", "table", "book", "rocket", "chat", "code", "mail"];
  d.innerHTML = `<form class="modal-card help-card agent-form" method="dialog">
    <div class="modal-head"><h2 id="help-title">${agent?.id ? "Edit agent" : "New agent"}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="agent-form-body">
      <label class="field"><span>Name</span><input name="name" required maxlength="50" value="${esc(a.name)}" placeholder="e.g. Flutter Expert"></label>
      <label class="field"><span>One-line description</span><input name="description" maxlength="160" value="${esc(a.description)}" placeholder="What it is good at"></label>
      <label class="field"><span>Instructions</span><textarea name="prompt" rows="6" required maxlength="8000" placeholder="How this agent thinks, talks and builds">${esc(a.prompt)}</textarea></label>
      <label class="field"><span>Starter prompts (one per line)</span><textarea name="starters" rows="3" placeholder="Build a login screen">${esc((a.starters || []).join("\n"))}</textarea></label>
      <fieldset class="field"><legend>Look</legend><div class="icon-pick">${ICONS.map((ic) => `<label><input type="radio" name="icon" value="${ic}"${a.icon === ic ? " checked" : ""}><span>${icon(ic, 16)}</span></label>`).join("")}</div>
        <div class="seg sm">${["pink", "blue", "ink"].map((t) => `<label><input type="radio" name="tone" value="${t}"${a.tone === t ? " checked" : ""}><span>${t[0].toUpperCase() + t.slice(1)}</span></label>`).join("")}</div></fieldset>
    </div>
    <div class="agent-form-foot">
      ${agent?.id ? `<button type="button" class="btn-danger sm" data-del>${icon("trash", 14)} Delete</button><button type="button" class="btn-ghost sm" data-export>${icon("download", 14)} Export</button>` : ""}
      <span class="spacer"></span><button class="btn-primary">${icon("check", 16)} Save agent</button></div></form>`;
  const f = d.querySelector("form");
  d.querySelector("[data-close]").onclick = () => d.close();
  f.onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const next = cleanAgent({ id: agent?.id, name: fd.get("name"), description: fd.get("description"), prompt: fd.get("prompt"), starters: String(fd.get("starters")).split("\n"), icon: fd.get("icon"), tone: fd.get("tone") });
    const list = (state.settings.agents ||= []);
    const i = list.findIndex((x) => x.id === next.id);
    if (i >= 0) list[i] = next;
    else list.unshift(next);
    save();
    d.close();
    done();
  };
  const del = d.querySelector("[data-del]");
  if (del) del.onclick = () => {
    if (!confirm(`Delete “${agent.name}”?`)) return;
    state.settings.agents = state.settings.agents.filter((x) => x.id !== agent.id);
    save();
    d.close();
    done();
  };
  const exp = d.querySelector("[data-export]");
  if (exp) exp.onclick = () => {
    const a2 = document.createElement("a");
    a2.href = URL.createObjectURL(new Blob([JSON.stringify(agent, null, 2)], { type: "application/json" }));
    a2.download = `${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.diji-agent.json`;
    a2.click();
    setTimeout(() => URL.revokeObjectURL(a2.href), 1000);
  };
  d.showModal();
}

export function renderPlugins(body) {
  const list = servers();
  body.innerHTML = `
    <h3>Plugins (MCP)</h3>
    <p class="muted">Connect remote MCP servers and Diji can use their tools while it works. Diji calls them through its relay, so servers do not need CORS.</p>
    <ul class="plain-list mcp-list">${list
      .map((s) => `<li class="mcp-item">
        <label class="switch"><input type="checkbox" data-mcp-on="${s.id}"${s.enabled ? " checked" : ""}><span class="track"></span></label>
        <span class="mcp-info"><strong>${esc(s.name)}</strong><small class="muted">${s.tools?.length ? `${s.tools.length} tools: ${esc(s.tools.slice(0, 4).map((t) => t.name).join(", "))}${s.tools.length > 4 ? "…" : ""}` : "Not connected"}</small></span>
        <button type="button" class="btn-ghost sm" data-mcp-check="${s.id}">${icon("refresh", 14)} Connect</button>
        <button type="button" class="icon-btn tiny" data-mcp-rm="${s.id}" aria-label="Remove ${esc(s.name)}">${icon("x", 13)}</button></li>`)
      .join("") || `<li class="muted sm">No plugins yet. Add one below or pick a suggestion.</li>`}</ul>
    <form class="mcp-add" id="mcp-add">
      <label class="field"><span>Name</span><input name="name" required maxlength="30" placeholder="github"></label>
      <label class="field grow"><span>Server URL (Streamable HTTP)</span><input name="url" required type="url" placeholder="https://example.com/mcp"></label>
      <label class="field grow"><span>Access token (optional)</span><input name="token" type="password" autocomplete="off" placeholder="Sent as Authorization: Bearer"></label>
      <button class="btn-primary">${icon("plus", 16)} Add plugin</button>
    </form>
    <div class="field"><span>Suggestions</span><div class="mcp-sugg">${SUGGESTED_MCP.filter((x) => !list.some((s) => s.url === x.url))
      .map((x) => `<button type="button" class="tpl" data-mcp-sugg="${esc(x.url)}">${icon("plus", 13)} ${esc(x.name)} <small class="muted">${esc(x.note)}</small></button>`)
      .join("") || `<span class="muted sm">All suggestions added.</span>`}</div></div>`;
  const add = async (name, url, token) => {
    const s = { id: uid(), name: name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").toLowerCase(), url: url.trim(), token: token?.trim() || "", enabled: true, tools: [] };
    if (list.some((x) => x.name.toLowerCase() === s.name.toLowerCase())) return toast("A plugin with that name already exists.", "error", { keep: false });
    list.push(s);
    save();
    await check(s);
  };
  const check = async (s) => {
    try {
      await connectServer(s);
      toast(`${s.name}: ${s.tools.length} tools ready.`, "success", { keep: false });
    } catch (e) {
      toast(`${s.name}: ${e.message}`, "error", { keep: false });
    }
    renderPlugins(body);
  };
  body.querySelector("#mcp-add").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    add(fd.get("name"), fd.get("url"), fd.get("token"));
  };
  body.querySelectorAll("[data-mcp-sugg]").forEach((b) => (b.onclick = () => {
    const x = SUGGESTED_MCP.find((y) => y.url === b.dataset.mcpSugg);
    add(x.name.toLowerCase(), x.url);
  }));
  body.querySelectorAll("[data-mcp-on]").forEach((c) => (c.onchange = () => {
    list.find((s) => s.id === c.dataset.mcpOn).enabled = c.checked;
    save();
  }));
  body.querySelectorAll("[data-mcp-check]").forEach((b) => (b.onclick = () => {
    b.disabled = true;
    check(list.find((s) => s.id === b.dataset.mcpCheck));
  }));
  body.querySelectorAll("[data-mcp-rm]").forEach((b) => (b.onclick = () => {
    state.settings.mcp = list.filter((s) => s.id !== b.dataset.mcpRm);
    save();
    renderPlugins(body);
  }));
}
