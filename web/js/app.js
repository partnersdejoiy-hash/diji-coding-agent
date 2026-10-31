// Diji app shell: sidebar, thread, composer, workspace panel, popovers. Plain DOM, no framework.
import { state, save, activeChat, newChat, deleteChat, uid, projectOf } from "./store.js";
import { renderProjects, renderProject, renderArtifacts, createProject } from "./pages.js";
import { renderAgents, agentOf } from "./agents.js";
import { Speech, canSpeak, speak, stopSpeaking, listenOnce, speakable } from "./voice.js";
import { PROVIDERS, providerById } from "../shared/catalog.js";
import { icon } from "./icons.js";
import { diji, setMood } from "./mascot.js";
import { esc, renderMarkdown, segments } from "./markdown.js";
import { runAgent, enhancePrompt } from "./agent.js";
import { isOffice } from "./office.js";
import { downloadOffice, renderPreview, renderCode, renderHistory, buildPreview, previewFrame, zip, downloadBlob, openInStackBlitz, importFromGitHub } from "./workspace.js";
import { commitChanges, restoreVersion } from "./versions.js";
import { renderBrowser, cloud, browserCall, serverConfigured, checkCloud } from "./browser.js";
import { loadSkills, activeSkills } from "./skills.js";
import { openSettings, openSkills, onSettingsChange, isConnected } from "./settings.js";
import { pushToGitHub, deployToVercel, githubToken, vercelToken, slug } from "./ship.js";
import { toast, systemNotify, onNotificationsChange, unreadCount, markAllRead, clearNotifications } from "./notify.js";

const $ = (s, r = document) => r.querySelector(s);
const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const mq = {
  mobile: matchMedia("(max-width: 767px)"),
  wide: matchMedia("(min-width: 1180px)"),
  reduced: matchMedia("(prefers-reduced-motion: reduce)"),
};

const ui = {
  busy: false,
  abort: null,
  panelTab: "preview",
  codeFile: null,
  attachments: [], // { name, text } or { name, image: dataUrl }
  picked: null, // element chosen in the preview
  picking: false,
  problems: [], // runtime errors reported by the preview
  codeView: { mode: "code", query: "" },
  msgEls: new Map(),
  pending: new Map(),
  stick: true,
  view: "chat", // chat | projects | project:<id> | artifacts
  pendingProject: null, // project chosen for the next new chat
};

/* ---------- static icons ---------- */
function paintIcons() {
  $("#brand-mark").innerHTML = diji(28);
  $("#side-close").innerHTML = icon("sidebar");
  $("#side-open").innerHTML = icon("sidebar");
  $("#new-chat-ic").innerHTML = icon("plus", 17);
  $("#search-ic").innerHTML = icon("search", 15);
  $("#skills-ic").innerHTML = icon("book", 17);
  $("#settings-ic").innerHTML = icon("settings", 17);
  $("#bell-btn").insertAdjacentHTML("afterbegin", icon("bell"));
  $("#gh-link").innerHTML = icon("github");
  $("#files-ic").innerHTML = icon("code", 16);
  $("#browser-ic").innerHTML = icon("globe", 16);
  $("#attach-btn").innerHTML = icon("clip");
  $("#enhance-btn").innerHTML = icon("wand", 17);
  $("#mic-btn").innerHTML = icon("mic", 17);
  $("#open-tab").innerHTML = icon("external", 17);
  $("#zip-btn").innerHTML = icon("download", 17);
  $("#gh-push-btn").innerHTML = icon("github", 17);
  $("#vercel-btn").innerHTML = icon("cloudUp", 17);
  $("#panel-close").innerHTML = icon("x");
  $("#jump").innerHTML = icon("arrowDown", 18);
  $("#drop-ic").innerHTML = icon("upload", 28);
  $("#projects-ic").innerHTML = icon("folder", 17);
  $("#artifacts-ic").innerHTML = icon("layers", 17);
  $("#agents-ic").innerHTML = icon("bot", 17);
  $("#chat-menu-btn").innerHTML = icon("chevronDown", 16);
  $("#incognito-btn").innerHTML = icon("ghost", 18);
  $("#voice-btn").innerHTML = icon("audio", 17);
  if (!Speech || !canSpeak) $("#voice-btn").hidden = true;
}

/* ---------- theme ---------- */
function applyTheme() {
  const t = state.settings.theme;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $("#theme-btn").innerHTML = icon({ system: "monitor", light: "sun", dark: "moon" }[t]);
  $("#theme-btn").setAttribute("aria-label", `Theme: ${t}. Change theme`);
}

/* ---------- sidebar ---------- */
function setSidebar(open) {
  state.settings.sidebarOpen = open;
  save();
  document.body.classList.toggle("side-open", open);
  $("#scrim").hidden = !(open && !mq.wide.matches) && !(ui.panelOpen && !mq.wide.matches);
}

function groupLabel(ts) {
  const d = (Date.now() - ts) / 86400000;
  return d < 1 && new Date(ts).getDate() === new Date().getDate() ? "Today" : d < 7 ? "Previous 7 days" : d < 30 ? "Previous 30 days" : "Older";
}

function openChat(id, withPanel) {
  if (ui.busy && id !== state.activeId) ui.abort?.abort();
  if (id !== state.activeId) state.chats = state.chats.filter((c) => !c.incognito); // leaving incognito forgets it
  state.activeId = id;
  save();
  setView("chat");
  if (withPanel) openPanel("preview");
  if (!mq.wide.matches) setSidebar(false);
}

function setView(view) {
  ui.view = view;
  const page = $("#page");
  const isChat = view === "chat";
  page.hidden = isChat;
  $("#thread").hidden = !isChat;
  $("#composer").hidden = !isChat;
  if (!isChat) $("#jump").hidden = true;
  document.body.classList.toggle("on-page", !isChat);
  document.querySelectorAll(".side-nav [data-view]").forEach((b) => b.setAttribute("aria-current", String(view.startsWith(b.dataset.view))));
  if (!isChat) {
    if (ui.panelOpen) closePanel();
    const h = {
      openProject: (id) => setView("project:" + id),
      back: () => setView("projects"),
      newChatIn: (pid) => {
        newChat({ projectId: pid });
        setView("chat");
        input.focus();
      },
      openChat,
    };
    if (view === "projects") renderProjects(page, h);
    else if (view.startsWith("project:")) renderProject(page, view.slice(8), h);
    else if (view === "artifacts") renderArtifacts(page, h);
    else if (view === "agents") renderAgents(page, { chatWith: (id) => {
      newChat({ agentId: id });
      setView("chat");
      input.focus();
    } });
    const p = view.startsWith("project:") ? state.projects.find((x) => x.id === view.slice(8)) : null;
    $("#chat-title").textContent = p ? p.name : { artifacts: "Artifacts", agents: "Agents" }[view] || "Projects";
    $("#chat-menu-btn").hidden = true;
    page.scrollTop = 0;
  } else renderAll();
  renderChatList();
}
document.querySelectorAll(".side-nav [data-view]").forEach((b) => (b.onclick = () => {
  setView(b.dataset.view);
  if (!mq.wide.matches) setSidebar(false);
}));

function renderChatList() {
  const q = $("#chat-search").value.trim().toLowerCase();
  const list = $("#chat-list");
  const chats = state.chats
    .filter((c) => !c.incognito)
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.role === "user" && m.content.toLowerCase().includes(q)))
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
  if (!chats.length) {
    list.innerHTML = `<p class="side-empty">${q ? "No chats match." : "Your chats will live here."}</p>`;
    return;
  }
  let html = "";
  let last = "";
  for (const c of chats) {
    const g = c.starred ? "Starred" : groupLabel(c.updated);
    if (g !== last) html += `<h2 class="side-group">${g}</h2>`;
    last = g;
    html += `<div class="chat-item${c.id === state.activeId ? " on" : ""}" data-id="${c.id}">
      <button class="chat-link" data-open="${c.id}" ${c.id === state.activeId && ui.view === "chat" ? 'aria-current="page"' : ""}>${c.projectId ? `<span class="chat-proj" title="${esc(projectOf(c)?.name || "")}">${icon("folder", 12)}</span>` : ""}${esc(c.title)}</button>
      <button class="icon-btn tiny${c.starred ? " starred" : ""}" data-star="${c.id}" aria-label="${c.starred ? "Unstar" : "Star"} chat" aria-pressed="${Boolean(c.starred)}">${icon("star", 14)}</button>
      <button class="icon-btn tiny" data-rename="${c.id}" aria-label="Rename chat">${icon("pencil", 14)}</button>
      <button class="icon-btn tiny" data-delete="${c.id}" aria-label="Delete chat">${icon("trash", 14)}</button></div>`;
  }
  list.innerHTML = html;
}

$("#chat-list").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]")?.dataset.open;
  const ren = e.target.closest("[data-rename]")?.dataset.rename;
  const del = e.target.closest("[data-delete]")?.dataset.delete;
  const star = e.target.closest("[data-star]")?.dataset.star;
  if (open) openChat(open);
  if (star) {
    const c = state.chats.find((x) => x.id === star);
    c.starred = !c.starred;
    save();
    renderChatList();
  }
  if (ren) {
    const c = state.chats.find((x) => x.id === ren);
    const t = prompt("Rename chat", c.title);
    if (t && t.trim()) {
      c.title = t.trim().slice(0, 80);
      save();
      renderChatList();
      renderTitle();
    }
  }
  if (del) {
    const c = state.chats.find((x) => x.id === del);
    const snapshot = structuredClone(c);
    const idx = state.chats.indexOf(c);
    deleteChat(del);
    renderAll();
    toast(`Deleted “${snapshot.title}”.`, "info", {
      keep: false,
      action: {
        label: "Undo",
        run: () => {
          state.chats.splice(idx, 0, snapshot);
          state.activeId = snapshot.id;
          save();
          renderAll();
        },
      },
    });
  }
});

/* ---------- thread ---------- */
const STARTERS = [
  { t: "Build a landing page", d: "for a college tech fest, bold and responsive", p: "Build a bold, responsive landing page for a college tech fest called Hackfiesta: hero, schedule, speakers, register form. Plain HTML/CSS/JS." },
  { t: "Make a small game", d: "snake with scores and smooth controls", p: "Make a polished Snake game in one index.html with keyboard and swipe controls, a score, a high score saved locally and a pause button." },
  { t: "Explain and fix my code", d: "paste a bug, get a fix with the why", p: "I'll paste some code with a bug. Find the root cause, explain it in two sentences, then give the fixed file." },
  { t: "Research before coding", d: "check the latest docs on the web first", p: "Search the web for the current way to deploy a static site with serverless functions on Vercel, then summarize the steps with links." },
];

// Starter templates (bolt.diy / Dyad style): a stack and a shape to begin from.
const TEMPLATES = [
  { t: "React app", p: "Start a React 19 app that runs without a build step: index.html with an import map to esm.sh for react and react-dom, an app.js using htm for JSX-like templates, and a clean starter screen with a counter and a todo list. Responsive and accessible." },
  { t: "Tailwind site", p: "Start a responsive marketing site using the Tailwind CSS play CDN: sticky nav, hero with a clear call to action, three feature sections, pricing, FAQ and footer. Use a distinctive palette, not purple gradients." },
  { t: "Three.js scene", p: "Start an interactive Three.js scene in one index.html using an import map to the three ES module CDN: a lit, slowly rotating hero object with orbit controls, a soft ground shadow and a resize-aware renderer." },
  { t: "Dashboard", p: "Start an analytics dashboard in plain HTML/CSS/JS with Chart.js from a CDN: KPI row with comparisons, a line chart over 30 days, a bar chart by category and a sortable table. Realistic sample data, light and dark theme." },
  { t: "Portfolio", p: "Start a personal developer portfolio: intro, selected projects with images, skills, experience timeline and a contact form with validation. Plain HTML/CSS/JS, fast and responsive." },
  { t: "2D game", p: "Start a small canvas game in one index.html: a player that moves with arrow keys and touch, collectible items, enemies, score, levels and a game-over screen with restart." },
];

function greeting() {
  const h = new Date().getHours();
  const n = state.settings.userName ? `, ${esc(state.settings.userName)}` : "";
  const chat = activeChat();
  if (chat?.incognito) return "Incognito chat. Nothing here is saved.";
  if (agentOf(chat)) return `${esc(agentOf(chat).name)} is ready${n}.`;
  if (projectOf(chat)) return `What are we building in ${esc(projectOf(chat).name)}?`;
  return h < 5 ? `Burning the midnight oil${n}?` : h < 12 ? `Good morning${n}! What are we building?` : h < 17 ? `Good afternoon${n}! What are we building?` : h < 22 ? `Good evening${n}! What are we building?` : `Late-night build session${n}?`;
}

function renderEmpty(thread) {
  const agent = agentOf(activeChat());
  const starters = agent?.starters?.length ? agent.starters.map((t) => ({ t, d: agent.name, p: t })) : STARTERS;
  thread.innerHTML = `<div class="empty">
    <div class="empty-mascot">${diji(88, "happy")}</div>
    <h2 class="empty-title">${greeting()}</h2>
    <p class="empty-sub">${agent ? esc(agent.description) : "I'm Diji. I write code you can run, preview it live, and look things up in a real browser when I need to."}</p>
    <div class="starters">${starters.map((s, i) => `<button class="starter" data-starter="${i}"><strong>${esc(s.t)}</strong><span>${esc(s.d)}</span></button>`).join("")}</div>
    <div class="templates"><span class="muted">Start from</span>${TEMPLATES.map((t, i) => `<button class="tpl" data-tpl="${i}">${t.t}</button>`).join("")}<button class="tpl" data-import-gh>${icon("github", 13)} GitHub repo</button></div>
  </div>`;
  thread.querySelectorAll("[data-tpl]").forEach((b) => (b.onclick = () => {
    input.value = TEMPLATES[b.dataset.tpl].p;
    autosize();
    input.focus();
  }));
  thread.querySelector("[data-import-gh]").onclick = openImport;
  thread.querySelectorAll("[data-starter]").forEach((b) => (b.onclick = () => {
    const input = $("#composer-input");
    input.value = starters[b.dataset.starter].p;
    autosize();
    input.focus();
  }));
  const m = thread.querySelector(".empty-mascot");
  setTimeout(() => setMood(m, "idle"), 1600);
}

function renderThread() {
  const chat = activeChat();
  const thread = $("#thread");
  ui.msgEls.clear();
  document.body.classList.toggle("is-empty", !chat || !chat.messages.length);
  if (!chat || !chat.messages.length) return renderEmpty(thread);
  thread.innerHTML = `<div class="thread-inner" id="thread-inner"></div>`;
  const inner = $("#thread-inner");
  for (const m of chat.messages) inner.append(messageEl(m));
  scrollToEnd(true);
}

function lastAssistantId(chat) {
  for (let i = chat.messages.length - 1; i >= 0; i--) if (chat.messages[i].role === "assistant") return chat.messages[i].id;
  return null;
}

function messageEl(m) {
  let node;
  if (m.role === "user") {
    node = el(`<article class="msg user" data-id="${m.id}">
      <div class="bubble"></div>
      ${m.images?.length ? `<div class="img-row">${m.images.map((u) => `<img src="${esc(u)}" alt="Attached image" loading="lazy">`).join("")}</div>` : ""}
      ${m.files?.length || m.picked ? `<div class="att-row">${m.picked ? `<span class="att">${icon("pointer", 13)}${esc(m.picked)}</span>` : ""}${(m.files || []).map((f) => `<span class="att">${icon("file", 13)}${esc(f)}</span>`).join("")}</div>` : ""}
      <div class="msg-actions"><button class="icon-btn tiny" data-copy-msg aria-label="Copy message">${icon("copy", 14)}</button>
      <button class="icon-btn tiny" data-edit aria-label="Edit and resend">${icon("pencil", 14)}</button></div></article>`);
    node.querySelector(".bubble").textContent = m.content;
  } else if (m.role === "tool") {
    node = el(`<article class="msg tool" data-id="${m.id}"></article>`);
    fillTool(node, m);
  } else {
    node = el(`<article class="msg assistant" data-id="${m.id}">
      <div class="avatar">${diji(30, m.streaming ? "thinking" : "idle")}</div>
      <div class="msg-body"><div class="content"></div><div class="msg-foot"></div></div></article>`);
    fillAssistant(node, m);
  }
  ui.msgEls.set(m.id, node);
  return node;
}

function fillTool(node, m) {
  if (m.tool === "mcp" || m.tool.startsWith("gmail-")) {
    const a = m.args || {};
    const label = {
      mcp: [`Using ${esc(a.server)} · ${esc(a.tool)}…`, `Used ${esc(a.server)} · ${esc(a.tool)}`, "plug"],
      "gmail-search": [`Searching Gmail for “${esc(a.query || "inbox")}”…`, `Searched Gmail for “${esc(a.query || "inbox")}”`, "mail"],
      "gmail-read": ["Opening an email…", "Read an email", "mail"],
      "gmail-draft": ["Writing a Gmail draft…", `Saved a draft to ${esc(a.to || "")} in Gmail`, "mail"],
    }[m.tool];
    const st = m.pending ? `<span class="spinner"></span>` : m.failed ? icon("alert", 15) : icon("check", 15);
    node.className = `msg tool${m.pending ? " pending" : ""}${m.failed ? " failed" : ""}`;
    node.innerHTML = `<details class="tool-card mcp-card"><summary><span class="tool-ic">${icon(label[2], 15)}</span>
      <span class="tool-text"><span class="tool-label">${m.pending ? label[0] : label[1]}</span>
      ${m.failed ? `<span class="tool-err">${esc(m.failed)}</span>` : ""}</span><span class="tool-status">${st}</span></summary>
      ${m.content && !m.pending ? `<pre class="mcp-out">${esc(m.content.replace(/^<diji-result[^>]*>\n?|\n?<\/diji-result>$/g, "").slice(0, 4000))}</pre>` : ""}</details>`;
    return;
  }
  const label = m.tool === "search" ? `Searched the web for “${esc(m.args.query || "")}”` : `Read ${esc(m.title || m.args.url || "a page")}`;
  const status = m.pending ? `<span class="spinner"></span>` : m.failed ? icon("alert", 15) : icon("check", 15);
  node.className = `msg tool${m.pending ? " pending" : ""}${m.failed ? " failed" : ""}`;
  node.innerHTML = `<button class="tool-card" data-open-browser ${m.shot ? "" : "disabled"}>
    <span class="tool-ic">${icon(m.tool === "search" ? "search" : "globe", 15)}</span>
    <span class="tool-text"><span class="tool-label">${m.pending ? (m.tool === "search" ? "Searching the web…" : "Opening page…") : label}</span>
    ${m.failed ? `<span class="tool-err">${esc(m.failed)}</span>` : m.url && !m.pending ? `<span class="tool-url">${esc(m.url.replace(/^https?:\/\//, "").slice(0, 70))}</span>` : ""}</span>
    ${m.shot ? `<img class="tool-thumb" alt="" src="data:image/jpeg;base64,${m.shot}">` : ""}
    <span class="tool-status">${status}</span></button>`;
}

function fileCard(s, chat, m) {
  const lines = s.code ? s.code.split("\n").length : 0;
  const isNew = chat && chat.files[s.path] === s.code;
  const ch = m?.changes?.find((c) => c.path === s.path);
  const locked = m?.skipped?.includes(s.path);
  const pending = m?.pending && s.path in m.pending;
  const stat = locked ? `<span class="warn">Locked, not changed</span>` : pending ? `<span>Waiting for your review</span>` : m?.ignored ? `<span>Not applied (${m.mode} mode)</span>` : ch ? `<span class="stat"><span class="plus">+${ch.added}</span> <span class="minus">−${ch.removed}</span>${ch.status === "added" ? " · new" : ""}</span>` : "";
  return `<button class="file-card${s.done ? "" : " writing"}" data-file="${esc(s.path)}">
    <span class="file-ic">${icon(locked ? "lock" : "file", 16)}</span>
    <span class="file-meta"><strong>${esc(s.path)}</strong><span>${s.done ? `${lines} lines${isNew || !chat?.files[s.path] ? "" : " · older version"}` : `Writing… ${lines} lines`} ${s.done ? stat : ""}</span></span>
    <span class="file-go">${s.done ? icon("chevronRight", 16) : '<span class="spinner"></span>'}</span></button>`;
}

function fillAssistant(node, m) {
  const chat = activeChat();
  const content = node.querySelector(".content");
  const foot = node.querySelector(".msg-foot");
  setMood(node.querySelector(".avatar"), m.error ? "oops" : m.streaming ? "thinking" : "idle");
  if (!m.content && m.streaming) {
    content.innerHTML = `<div class="thinking"><span>Diji is thinking…</span></div>`;
  } else {
    let html = "";
    for (const s of segments(m.content)) {
      if (s.type === "text") html += `<div class="md">${renderMarkdown(s.text)}</div>`;
      else if (s.type === "file") html += fileCard(s, chat, m) + (isOffice(s.path) && s.done && !m.streaming ? `<button type="button" class="office-dl" data-office-dl="${esc(s.path)}">${icon({ docx: "doc", pptx: "slides", xlsx: "sheet" }[s.path.split(".").pop().toLowerCase()], 15)} Download ${esc(s.path.split("/").pop())}</button>` : "");
      else if (s.type === "error") html += `<div class="callout err">${icon("alert", 16)}<span>${esc(s.text)}</span></div>`;
      else if (s.type === "tool" && s.tool === "delete") html += `<div class="chip-note">${icon("trash", 13)} Deleted ${esc(s.args.path || "")}</div>`;
      else if (s.type === "tool" && s.tool === "remember") html += `<div class="chip-note">${icon("brain", 13)} Remembered: ${esc(s.args.text || "")}</div>`;
      else if (s.type === "thinking") html += `<details class="think"${s.done ? "" : " open"}><summary>${icon("sparkles", 14)} ${s.done ? "Thought process" : "Thinking…"}</summary><div class="think-body">${esc(s.text)}</div></details>`;
    }
    if (m.streaming) html += `<span class="caret" aria-hidden="true"></span>`;
    content.innerHTML = html;
  }
  if (!m.streaming && m.pending && Object.keys(m.pending).length) {
    const n = Object.keys(m.pending).length;
    content.insertAdjacentHTML("beforeend", `<div class="review">${icon("eye", 16)}<span><strong>${n} change${n > 1 ? "s" : ""} to review.</strong> Open a file card to read it, then apply or reject.</span>
      <button class="btn-ghost sm" data-reject>Reject</button><button class="btn-primary sm" data-apply>${icon("check", 14)} Apply</button></div>`);
  }
  if (!m.streaming && m.mode === "plan" && !m.error && chat && lastAssistantId(chat) === m.id && !ui.busy) {
    content.insertAdjacentHTML("beforeend", `<div class="review plan">${icon("map", 16)}<span>Happy with the plan?</span><button class="btn-primary sm" data-build-plan>${icon("hammer", 14)} Build it</button></div>`);
  }
  if (m.error) content.insertAdjacentHTML("beforeend", `<div class="callout err">${icon("alert", 16)}<span>${esc(m.error)}</span><button class="btn-ghost sm" data-fix-settings>Open settings</button></div>`);
  const isLast = chat && lastAssistantId(chat) === m.id;
  foot.innerHTML = m.streaming
    ? ""
    : `<div class="msg-actions">
        ${versionNav(chat, m)}
        <button class="icon-btn tiny" data-copy-msg aria-label="Copy reply">${icon("copy", 14)}</button>
        ${canSpeak ? `<button class="icon-btn tiny" data-speak aria-label="Read aloud">${icon("volume", 14)}</button>` : ""}
        <button class="icon-btn tiny${m.feedback === "up" ? " on" : ""}" data-fb="up" aria-label="Good response" aria-pressed="${m.feedback === "up"}">${icon("thumbUp", 14)}</button>
        <button class="icon-btn tiny${m.feedback === "down" ? " on" : ""}" data-fb="down" aria-label="Bad response" aria-pressed="${m.feedback === "down"}">${icon("thumbDown", 14)}</button>
        ${isLast ? `<button class="icon-btn tiny" data-retry aria-label="Regenerate reply">${icon("refresh", 14)}</button>` : ""}
        ${m.changes?.length && chat?.versions?.some((v) => v.msgId === m.id) ? `<button class="icon-btn tiny" data-undo-msg aria-label="Undo this reply's changes" title="Undo this reply's changes">${icon("history", 14)}</button>` : ""}
        ${m.stopped ? `<span class="muted sm">Stopped</span>` : ""}
        <span class="meta">${esc(m.model || "")}${m.mode && m.mode !== "build" ? ` · ${m.mode}` : ""}${m.tokens ? ` · ~${m.tokens > 999 ? (m.tokens / 1000).toFixed(1) + "k" : m.tokens} tokens` : ""}${m.skills?.length ? ` · ${m.skills.map(esc).join(", ")}` : ""}</span></div>`;
}

// Response versions (Claude-style "< 2 / 3 >"): every regenerate keeps the earlier answers.
function parentUser(chat, m) {
  const i = chat.messages.indexOf(m);
  for (let k = i - 1; k >= 0; k--) if (chat.messages[k].role === "user") return chat.messages[k];
  return null;
}
function versionNav(chat, m) {
  if (!chat) return "";
  const u = parentUser(chat, m);
  if (!u?.tails || u.tails.length < 2) return "";
  // Show it on the last assistant message of this turn only.
  const i = chat.messages.indexOf(m);
  const next = chat.messages.slice(i + 1).find((x) => x.role !== "tool");
  if (next && next.role === "assistant") return "";
  return `<span class="versions-nav"><button class="icon-btn tiny" data-ver="-1" data-user="${u.id}" aria-label="Previous version"${u.tailIndex === 0 ? " disabled" : ""}>${icon("chevronLeft", 14)}</button><span>${u.tailIndex + 1} / ${u.tails.length}</span><button class="icon-btn tiny" data-ver="1" data-user="${u.id}" aria-label="Next version"${u.tailIndex === u.tails.length - 1 ? " disabled" : ""}>${icon("chevronRight", 14)}</button></span>`;
}
function switchVersion(chat, userId, dir) {
  const u = chat.messages.find((m) => m.id === userId);
  const i = chat.messages.indexOf(u);
  const target = u.tailIndex + dir;
  if (!u.tails || target < 0 || target >= u.tails.length) return;
  u.tails[u.tailIndex] = chat.messages.slice(i + 1);
  chat.messages.splice(i + 1, Infinity, ...u.tails[target]);
  u.tailIndex = target;
  save();
  renderThread();
}

function scheduleUpdate(m) {
  if (ui.pending.has(m.id)) return;
  ui.pending.set(
    m.id,
    requestAnimationFrame(() => {
      ui.pending.delete(m.id);
      let node = ui.msgEls.get(m.id);
      const inner = $("#thread-inner");
      if (!inner) return renderThread();
      if (!node) {
        node = messageEl(m);
        inner.append(node);
      } else if (m.role === "assistant") fillAssistant(node, m);
      else if (m.role === "tool") fillTool(node, m);
      // Refresh the previous assistant's actions so only the latest offers Regenerate.
      inner.querySelectorAll(".msg.assistant [data-retry]").forEach((b) => {
        if (b.closest(".msg").dataset.id !== lastAssistantId(activeChat())) b.remove();
      });
      scrollToEnd();
    }),
  );
}

function scrollToEnd(force) {
  const t = $("#thread");
  if (force || ui.stick) t.scrollTop = t.scrollHeight;
}
$("#thread").addEventListener("scroll", () => {
  const t = $("#thread");
  ui.stick = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
  $("#jump").hidden = ui.stick;
});
$("#jump").onclick = () => {
  ui.stick = true;
  scrollToEnd(true);
};

$("#thread").addEventListener("click", async (e) => {
  const chat = activeChat();
  const msgNode = e.target.closest(".msg");
  const msg = chat?.messages.find((m) => m.id === msgNode?.dataset.id);
  const officeBtn = e.target.closest("[data-office-dl]");
  if (officeBtn && chat) {
    const p = officeBtn.dataset.officeDl;
    const seg = msg ? segments(msg.content).find((s) => s.type === "file" && s.path === p) : null;
    return downloadOffice(p, chat.files[p] ?? seg?.code ?? "", officeBtn);
  }
  const copyCode = e.target.closest("[data-copy]");
  if (copyCode) {
    await navigator.clipboard.writeText(copyCode.closest(".codeblock").querySelector("code").innerText).catch(() => {});
    copyCode.textContent = "Copied";
    setTimeout(() => (copyCode.textContent = "Copy"), 1400);
    return;
  }
  const file = e.target.closest("[data-file]");
  if (file) {
    ui.codeFile = file.dataset.file;
    if (ui.codeView.mode !== "changes") ui.codeView.mode = undefined;
    openPanel("code");
    return;
  }
  if (e.target.closest("[data-open-browser]")) {
    if (msg?.shot) cloud.last = { url: msg.url, title: msg.title, shot: msg.shot };
    openPanel("browser");
    return;
  }
  if (e.target.closest("[data-fix-settings]")) return openSettings("models", state.settings.model.provider);
  if (e.target.closest("[data-apply]") && msg?.pending) {
    const r = commitChanges(chat, msg.pending, chat.messages.filter((x) => x.role === "user").at(-1)?.content || "Reviewed change", msg.id);
    msg.changes = r.summary;
    msg.skipped = r.skipped;
    delete msg.pending;
    save();
    afterFilesChanged(chat);
    scheduleUpdate(msg);
    toast(`Applied ${r.summary.length} change${r.summary.length === 1 ? "" : "s"}.`, "success", { keep: false });
    return;
  }
  if (e.target.closest("[data-reject]") && msg?.pending) {
    delete msg.pending;
    msg.rejected = true;
    save();
    scheduleUpdate(msg);
    toast("Rejected. Your files are unchanged.", "info", { keep: false });
    return;
  }
  if (e.target.closest("[data-build-plan]") && !ui.busy) {
    setMode("build");
    send("Go ahead and build the plan above.");
    return;
  }
  if (e.target.closest("[data-undo-msg]") && msg && !ui.busy) {
    const idx = chat.versions.findIndex((v) => v.msgId === msg.id);
    const before = chat.versions[idx - 1];
    if (before && restoreVersion(chat, before.id)) {
      afterFilesChanged(chat);
      toast(`Rolled back to “${before.label}”.`, "success", { keep: false, action: { label: "History", run: () => openPanel("history") } });
    }
    return;
  }
  if (e.target.closest("[data-copy-msg]") && msg) {
    await navigator.clipboard.writeText(msg.content).catch(() => {});
    toast("Copied to clipboard.", "success", { keep: false, ms: 1800 });
    return;
  }
  if (e.target.closest("[data-edit]") && msg && !ui.busy) {
    chat.messages.splice(chat.messages.indexOf(msg));
    save();
    renderThread();
    const input = $("#composer-input");
    input.value = msg.content;
    autosize();
    input.focus();
    return;
  }
  if (e.target.closest("[data-retry]") && !ui.busy) {
    let i = chat.messages.length - 1;
    while (i >= 0 && chat.messages[i].role !== "user") i--;
    const u = chat.messages[i];
    const tail = chat.messages.slice(i + 1);
    u.tails ||= [tail];
    u.tails[u.tailIndex ?? 0] = tail;
    chat.messages.splice(i + 1);
    save();
    renderThread();
    await run(chat);
    u.tails.push(chat.messages.slice(i + 1));
    u.tailIndex = u.tails.length - 1;
    save();
    renderThread();
    return;
  }
  const ver = e.target.closest("[data-ver]");
  if (ver && !ui.busy) return switchVersion(chat, ver.dataset.user, Number(ver.dataset.ver));
  const fb = e.target.closest("[data-fb]");
  if (fb && msg) {
    msg.feedback = msg.feedback === fb.dataset.fb ? undefined : fb.dataset.fb;
    save();
    scheduleUpdate(msg);
    if (msg.feedback) toast(msg.feedback === "up" ? "Thanks! Glad that helped." : "Thanks. Try Regenerate, switch the model, or tell Diji what was off.", "info", { keep: false, ms: 2600 });
    return;
  }
  if (e.target.closest("[data-speak]") && msg) {
    const b = e.target.closest("[data-speak]");
    if (b.classList.contains("on")) {
      stopSpeaking();
      b.classList.remove("on");
    } else {
      document.querySelectorAll("[data-speak].on").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      speak(msg.content, { onend: () => b.classList.remove("on") });
    }
    return;
  }
});

function renderTitle() {
  const chat = activeChat();
  if (ui.view !== "chat") return;
  const ag = agentOf(chat);
  $("#chat-title").innerHTML = `${ag ? `<span class="agent-chip">${icon(ag.icon || "sparkles", 13)}${esc(ag.name)}</span>` : ""}${esc(chat?.title || "New chat")}`;
  $("#chat-menu-btn").hidden = !chat || !chat.messages.length;
  $("#incognito-btn").setAttribute("aria-pressed", String(Boolean(chat?.incognito)));
  document.body.classList.toggle("incognito", Boolean(chat?.incognito));
  document.title = chat && chat.messages.length ? `${chat.title} · Diji` : "Diji — the joyful coding agent";
}

/* ---------- composer ---------- */
const input = $("#composer-input");
const defaultPlaceholder = () => (mq.mobile.matches ? "Ask Diji to build anything…" : "Ask Diji to build, fix or explain anything…  (@ to mention a file)");
input.placeholder = defaultPlaceholder();
function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, mq.mobile.matches ? 160 : 280) + "px";
  updateSend();
}
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && (state.settings.enterToSend || e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
});

function updateSend() {
  const b = $("#send-btn");
  b.innerHTML = icon(ui.busy ? "stop" : "send", 18);
  b.setAttribute("aria-label", ui.busy ? "Stop generating" : "Send");
  b.classList.toggle("stop", ui.busy);
  b.disabled = !ui.busy && !input.value.trim() && !ui.attachments.length;
  $("#enhance-btn").disabled = ui.busy || input.value.trim().length < 4;
}

function renderModelBtn() {
  const { provider, model } = state.settings.model;
  const p = providerById(provider);
  const eff = state.settings.effort && state.settings.effort !== "medium" ? state.settings.effort : "";
  $("#model-btn").innerHTML = `<span class="model-name">${esc(model)}</span><span class="model-prov">${esc(p?.name || provider)}</span>${eff ? `<span class="model-eff">${eff}</span>` : ""}${icon("chevronDown", 15)}`;
}

function renderSkillsBtn() {
  const pinned = state.settings.skills.length;
  const label = pinned ? `${pinned} skill${pinned > 1 ? "s" : ""}${state.settings.autoSkills ? " + auto" : ""}` : state.settings.autoSkills ? "Auto skills" : "No skills";
  const short = pinned ? `${pinned}${state.settings.autoSkills ? "+auto" : ""}` : state.settings.autoSkills ? "Auto" : "0";
  $("#skills-btn").innerHTML = `${icon("sparkles", 15)}<span class="lbl-full">${label}</span><span class="lbl-short">${short}</span>`;
  $("#skills-btn").setAttribute("aria-label", `Skills: ${label}`);
  $("#skills-count").textContent = String(pinned || "");
}

const TEXT_EXT = /\.(txt|md|markdown|js|mjs|cjs|jsx|ts|tsx|json|html?|css|scss|py|java|c|cc|cpp|h|hpp|cs|go|rs|rb|php|kt|swift|sql|ya?ml|toml|ini|env|sh|bat|ps1|xml|svg|csv|vue|svelte|astro|dart|lua|r|gradle|dockerfile|gitignore|log)$/i;
// Screenshots and mockups go to vision models, shrunk to keep requests small.
function shrinkImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error(`${file.name} is not an image Diji can read.`));
    img.src = URL.createObjectURL(file);
  });
}

async function addFiles(fileList) {
  for (const f of fileList) {
    if (f.type.startsWith("image/") && !/svg/.test(f.type)) {
      if (ui.attachments.filter((a) => a.image).length >= 3) {
        toast("Up to 3 images per message.", "error", { keep: false });
        continue;
      }
      try {
        ui.attachments.push({ name: f.name || "image.png", image: await shrinkImage(f) });
      } catch (e) {
        toast(e.message, "error", { keep: false });
      }
      continue;
    }
    if (!TEXT_EXT.test(f.name) && !f.type.startsWith("text/")) {
      toast(`${f.name} is not an image or a text/code file, so Diji cannot read it yet.`, "error", { keep: false });
      continue;
    }
    if (f.size > 300_000) {
      toast(`${f.name} is over 300 KB. Attach a smaller file or the relevant part.`, "error", { keep: false });
      continue;
    }
    ui.attachments.push({ name: f.name, text: await f.text() });
  }
  renderAttachments();
}
function renderAttachments() {
  const box = $("#attachments");
  box.hidden = !ui.attachments.length && !ui.picked;
  box.innerHTML =
    (ui.picked ? `<span class="att picked">${icon("pointer", 13)}Editing <code>${esc(ui.picked.selector)}</code><button type="button" data-rm-pick aria-label="Clear selected element">${icon("x", 12)}</button></span>` : "") +
    ui.attachments
      .map((a, i) => a.image
        ? `<span class="att img"><img src="${a.image}" alt=""><button type="button" data-rm-att="${i}" aria-label="Remove ${esc(a.name)}">${icon("x", 12)}</button></span>`
        : `<span class="att">${icon("file", 13)}${esc(a.name)}<button type="button" data-rm-att="${i}" aria-label="Remove ${esc(a.name)}">${icon("x", 12)}</button></span>`)
      .join("");
  const rp = box.querySelector("[data-rm-pick]");
  if (rp) rp.onclick = () => {
    ui.picked = null;
    renderAttachments();
  };
  box.querySelectorAll("[data-rm-att]").forEach((b) => (b.onclick = () => {
    ui.attachments.splice(Number(b.dataset.rmAtt), 1);
    renderAttachments();
  }));
  updateSend();
}
$("#attach-btn").onclick = () => $("#file-input").click();
$("#file-input").onchange = (e) => {
  addFiles(e.target.files);
  e.target.value = "";
};

let dragDepth = 0;
addEventListener("dragenter", (e) => {
  if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
  dragDepth++;
  $("#drop-hint").hidden = false;
});
addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    $("#drop-hint").hidden = true;
  }
});
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("#drop-hint").hidden = true;
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});
input.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    addFiles(files);
  }
});

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (ui.busy) {
    ui.abort?.abort();
    return;
  }
  send(input.value.trim());
});

// @file pulls a workspace file into the message; @https://… reads the page with the cloud browser (Cline-style mentions).
async function resolveMentions(text, chat) {
  let extra = "";
  const names = [];
  for (const [, path] of text.matchAll(/(?:^|\s)@([\w./-]+\.[\w]+)/g)) {
    if (chat.files[path] !== undefined && !names.includes(path)) {
      names.push(path);
      extra += `\n\n<mentioned-file path="${path}">\n${chat.files[path]}\n</mentioned-file>`;
    }
  }
  for (const [, url] of text.matchAll(/(?:^|\s)@(https?:\/\/\S+)/g)) {
    try {
      await browserCall("open", { url });
      const r = await browserCall("read", { max: 8000 });
      names.push(url.replace(/^https?:\/\//, "").slice(0, 40));
      extra += `\n\n<mentioned-page url="${r.url}" title="${(r.title || "").replace(/"/g, "'")}">\n${r.text}\n</mentioned-page>`;
    } catch (err) {
      toast(`Could not read ${url}: ${err.message}`, "error", { keep: false });
    }
  }
  return { extra, names };
}

async function send(text) {
  if (ui.busy || (!text && !ui.attachments.length && !ui.picked)) return;
  const chat = activeChat() || newChat(ui.pendingProject ? { projectId: ui.pendingProject } : {});
  const files = ui.attachments.filter((a) => !a.image);
  const images = ui.attachments.filter((a) => a.image).map((a) => a.image);
  let attachments = files.map((a) => `\n\n<attached-file name="${a.name}">\n${a.text}\n</attached-file>`).join("");
  const picked = ui.picked;
  if (picked) attachments += `\n\n<selected-element selector="${picked.selector}">\nThe user selected this element in the live preview; apply the request to it.\n${picked.html}\n</selected-element>`;
  input.value = "";
  input.placeholder = defaultPlaceholder();
  ui.attachments = [];
  ui.picked = null;
  renderAttachments();
  autosize();
  const mentions = text.includes("@") ? await resolveMentions(text, chat) : { extra: "", names: [] };
  attachments += mentions.extra;
  const content = text || (images.length ? "Here is an image." : picked ? "Edit the selected element." : "Here are some files.");
  chat.messages.push({ id: uid(), role: "user", content, attachments, images: images.length ? images : undefined, files: [...files.map((a) => a.name), ...mentions.names], picked: picked?.selector });
  if (chat.title === "New chat") chat.title = (text || files[0]?.name || "Image prompt").replace(/\s+/g, " ").slice(0, 60);
  chat.updated = Date.now();
  save();
  renderChatList();
  renderTitle();
  renderThread();
  run(chat);
}

function afterFilesChanged(chat) {
  renderFilesCount();
  if (chat.id !== state.activeId) return;
  ui.problems = [];
  if (!ui.panelOpen && mq.wide.matches && buildPreview(chat.files)) openPanel("preview");
  else if (ui.panelOpen) renderPanel();
}

async function run(chat) {
  ui.busy = true;
  ui.stick = true;
  ui.abort = new AbortController();
  updateSend();
  $("#thread").setAttribute("aria-busy", "true");
  const started = Date.now();
  let wroteFiles = [];
  try {
    const r = await runAgent(chat, {
      signal: ui.abort.signal,
      onUpdate: (m) => chat.id === state.activeId && scheduleUpdate(m),
      onMemory: (t) => toast(t, "info", { title: "Diji will remember", keep: false, action: { label: "Manage", run: () => openSettings("memory") } }),
      onFiles: (paths) => {
        wroteFiles = [...new Set([...wroteFiles, ...paths])];
        afterFilesChanged(chat);
      },
    });
    if (!r.stopped) {
      const secs = Math.round((Date.now() - started) / 1000);
      const summary = wroteFiles.length ? `Wrote ${wroteFiles.length} file${wroteFiles.length > 1 ? "s" : ""}: ${wroteFiles.slice(0, 3).join(", ")}${wroteFiles.length > 3 ? "…" : ""}` : "Reply ready.";
      const openAction = wroteFiles.length && !ui.panelOpen ? { label: "Open", run: () => openPanel(buildPreview(chat.files) ? "preview" : "code") } : undefined;
      if (wroteFiles.length || secs > 12) toast(summary, "agent", { title: `Diji finished “${chat.title.slice(0, 40).trim()}”`, action: openAction });
      systemNotify("Diji finished", summary);
    }
  } catch (e) {
    toast(e.message, "error", { title: "Diji hit a snag", keep: true });
    systemNotify("Diji hit a snag", e.message);
  } finally {
    ui.busy = false;
    ui.abort = null;
    chat.updated = Date.now();
    save();
    updateSend();
    $("#thread").setAttribute("aria-busy", "false");
    renderChatList();
  }
}

/* ---------- model popover ---------- */
function openModelPop() {
  const pop = $("#model-pop");
  const { provider, model } = state.settings.model;
  const connected = PROVIDERS.filter(isConnected);
  const others = PROVIDERS.filter((p) => !isConnected(p));
  pop.innerHTML = `<div class="pop-scroll">${connected
    .map((p) => {
      const ps = state.settings.providers[p.id] || {};
      const models = [...new Set([...(p.id === provider ? [model] : []), ...p.models, ...(ps.models || []).slice(0, 12)])].filter(Boolean);
      return `<div class="pop-group"><h3>${esc(p.name)}</h3>${models
        .map((m) => `<button role="option" class="pop-item" data-p="${p.id}" data-m="${esc(m)}" aria-selected="${p.id === provider && m === model}">
          <span>${esc(m)}</span>${p.id === provider && m === model ? icon("check", 15) : ""}</button>`)
        .join("")}</div>`;
    })
    .join("")}
    <div class="pop-group pop-tune"><h3>Effort</h3><div class="seg sm full">${["low", "medium", "high"]
      .map((e) => `<label><input type="radio" name="effort" value="${e}"${(state.settings.effort || "medium") === e ? " checked" : ""}><span>${e[0].toUpperCase() + e.slice(1)}</span></label>`)
      .join("")}</div>
      <h3>Style</h3><div class="seg sm full">${["normal", "concise", "explanatory", "formal"]
      .map((e) => `<label><input type="radio" name="style" value="${e}"${(state.settings.style || "normal") === e ? " checked" : ""}><span>${e[0].toUpperCase() + e.slice(1)}</span></label>`)
      .join("")}</div></div>
    <div class="pop-group"><h3>Bring your own key</h3>${others
      .map((p) => `<button class="pop-item muted-item" data-connect="${p.id}"><span>Connect ${esc(p.name)}</span>${icon("key", 14)}</button>`)
      .join("")}</div></div>`;
  pop.hidden = false;
  placePop(pop, $("#model-btn"));
  pop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
  pop.querySelector("button")?.focus({ preventScroll: true });
  pop.querySelectorAll("input[name=effort], input[name=style]").forEach((r) => (r.onchange = () => {
    state.settings[r.name] = r.value;
    save();
    renderModelBtn();
  }));
  pop.onclick = (e) => {
    const item = e.target.closest("[data-p]");
    const connect = e.target.closest("[data-connect]");
    if (item) {
      state.settings.model = { provider: item.dataset.p, model: item.dataset.m };
      save();
      renderModelBtn();
      closePops();
      input.focus();
    }
    if (connect) {
      closePops();
      openSettings("models", connect.dataset.connect);
    }
  };
}

function placePop(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = Math.min(320, innerWidth - 16);
  pop.style.width = w + "px";
  pop.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  const below = r.bottom + 8;
  const spaceAbove = r.top - 16;
  const spaceBelow = innerHeight - below - 8;
  if (spaceBelow >= 260 || spaceBelow > spaceAbove) {
    pop.style.top = below + "px";
    pop.style.bottom = "auto";
    pop.style.maxHeight = spaceBelow + "px";
  } else {
    pop.style.top = "auto";
    pop.style.bottom = innerHeight - r.top + 8 + "px";
    pop.style.maxHeight = spaceAbove + "px";
  }
}

function closePops() {
  $("#model-pop").hidden = true;
  $("#mode-pop").hidden = true;
  $("#mention-pop").hidden = true;
  $("#menu-pop").hidden = true;
  $("#notif-pop").hidden = true;
  if (!ui.shipping) $("#ship-pop").hidden = true;
}
$("#model-btn").onclick = (e) => {
  e.stopPropagation();
  $("#model-pop").hidden ? (closePops(), openModelPop()) : closePops();
};
document.addEventListener("click", (e) => {
  if (!e.target.closest(".popover") && !e.target.closest("#model-btn") && !e.target.closest("#bell-btn") && !e.target.closest("#gh-push-btn") && !e.target.closest("#vercel-btn") && !e.target.closest("#mode-btn") && !e.target.closest("#project-btn") && !e.target.closest("#perm-btn") && !e.target.closest("#chat-menu-btn") && !e.target.closest("[data-import-gh]") && !e.target.closest("[data-import]")) closePops();
});

/* ---------- notifications ---------- */
function renderBell() {
  const n = unreadCount();
  const b = $("#bell-badge");
  b.hidden = !n;
  b.textContent = n > 9 ? "9+" : String(n);
  $("#bell-btn").setAttribute("aria-label", n ? `Notifications, ${n} unread` : "Notifications");
}
function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(ts).toLocaleDateString();
}
function openNotifPop() {
  const pop = $("#notif-pop");
  const list = state.notifications;
  pop.innerHTML = `<div class="notif-head"><h3>Notifications</h3>${list.length ? `<button class="link-btn" id="notif-clear">Clear all</button>` : ""}</div>
    <div class="pop-scroll">${list.length
      ? list.map((n) => `<div class="notif ${n.type}${n.read ? "" : " unread"}"><span class="notif-ic">${icon({ success: "check", error: "alert", agent: "sparkles" }[n.type] || "info", 15)}</span>
          <div>${n.title ? `<strong>${esc(n.title)}</strong>` : ""}<p>${esc(n.message)}</p><time>${timeAgo(n.at)}</time></div></div>`).join("")
      : `<div class="notif-empty">${diji(44, "happy")}<p>All caught up.</p></div>`}</div>`;
  pop.hidden = false;
  placePop(pop, $("#bell-btn"));
  const clear = $("#notif-clear", pop);
  if (clear) clear.onclick = () => {
    clearNotifications();
    openNotifPop();
  };
  markAllRead();
}
$("#bell-btn").onclick = (e) => {
  e.stopPropagation();
  $("#notif-pop").hidden ? (closePops(), openNotifPop()) : closePops();
};

/* ---------- panel ---------- */
function renderFilesCount() {
  const chat = activeChat();
  const n = chat ? Object.keys(chat.files).length : 0;
  const c = $("#files-count");
  c.hidden = !n;
  c.textContent = String(n);
}

function openPanel(tab) {
  ui.panelTab = tab || ui.panelTab;
  ui.panelOpen = true;
  $("#panel").hidden = false;
  document.body.classList.add("panel-open");
  if (!mq.wide.matches) $("#scrim").hidden = false;
  renderPanel();
}
function closePanel() {
  ui.panelOpen = false;
  $("#panel").hidden = true;
  document.body.classList.remove("panel-open");
  setSidebar(state.settings.sidebarOpen && mq.wide.matches);
  syncTopButtons();
}
function syncTopButtons() {
  $("#files-btn").setAttribute("aria-pressed", String(ui.panelOpen && ui.panelTab !== "browser"));
  $("#browser-btn").setAttribute("aria-pressed", String(ui.panelOpen && ui.panelTab === "browser"));
}
function renderPanel() {
  if (!ui.panelOpen) return;
  const chat = activeChat() || { files: {} };
  document.querySelectorAll("#panel .tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === ui.panelTab)));
  const body = $("#panel-body");
  body.dataset.tab = ui.panelTab;
  const hasFiles = Object.keys(chat.files).length > 0;
  $("#zip-btn").hidden = $("#gh-push-btn").hidden = $("#vercel-btn").hidden = !hasFiles || ui.panelTab === "browser";
  $("#open-tab").hidden = ui.panelTab !== "preview" || !buildPreview(chat.files);
  if (body.dataset.rendered !== ui.panelTab) {
    body.innerHTML = "";
    body.dataset.rendered = ui.panelTab;
  }
  if (ui.panelTab === "preview") renderPreview(body, chat, ui, previewHandlers);
  if (ui.panelTab === "code") {
    renderCode(body, chat, { ...ui.codeView, selected: ui.codeFile }, codeHandlers);
    ui.codeView.focusSearch = false;
  }
  if (ui.panelTab === "history") renderHistory(body, chat, { onRestore: (id) => {
    if (ui.busy) return toast("Wait for Diji to finish first.", "info", { keep: false });
    if (restoreVersion(chat, id)) {
      afterFilesChanged(chat);
      toast("Restored. You can undo this from History too.", "success", { keep: false });
    }
  } });
  if (ui.panelTab === "browser") renderBrowser(body, { openSettings });
  syncTopButtons();
}
cloud.listeners.add(() => ui.panelTab === "browser" && renderPanel());

const previewHandlers = {
  onPick: () => {
    ui.picking = !ui.picking;
    previewFrame($("#panel-body"))?.contentWindow?.postMessage({ dijiPick: ui.picking }, "*");
    renderPanel();
  },
  onReload: () => {
    ui.problems = [];
    ui.picking = false;
  },
  onFix: () => {
    const list = ui.problems.slice(0, 8).map((p, i) => `${i + 1}. ${p.message}${p.line ? ` (line ${p.line})` : ""}`).join("\n");
    ui.problems = [];
    renderPanel();
    if (state.settings.mode !== "build") setMode("build");
    send(`The live preview reports these errors. Find the cause and fix them:\n${list}`);
  },
};

const codeHandlers = {
  onSelect: (p) => {
    ui.codeFile = p;
    if (ui.codeView.mode !== "changes") ui.codeView.mode = undefined; // each file opens in its natural view
    renderPanel();
  },
  onMode: (m) => {
    ui.codeView.mode = m;
    renderPanel();
  },
  onQuery: (q) => {
    ui.codeView.query = q;
    ui.codeView.focusSearch = true;
    renderPanel();
  },
  onLock: (path) => {
    const chat = activeChat();
    chat.locked ||= [];
    const i = chat.locked.indexOf(path);
    i >= 0 ? chat.locked.splice(i, 1) : chat.locked.push(path);
    save();
    renderPanel();
    toast(i >= 0 ? `${path} unlocked. Diji may change it again.` : `${path} locked. Diji will leave it alone.`, "info", { keep: false });
  },
  onSave: (path, code) => {
    const chat = activeChat();
    commitChanges(chat, { [path]: code }, `Manual edit of ${path}`);
    ui.codeView.mode = undefined;
    afterFilesChanged(chat);
    toast(`Saved ${path}. A checkpoint was created.`, "success", { keep: false });
  },
  onImport: () => openImport(),
  onZip: () => $("#zip-btn").click(),
  onStackBlitz: () => {
    const chat = activeChat();
    if (chat && Object.keys(chat.files).length) openInStackBlitz(chat.files, chat.title);
  },
};

// Messages from the live preview: runtime errors and picked elements.
addEventListener("message", (e) => {
  const frame = previewFrame($("#panel-body"));
  if (!frame || e.source !== frame.contentWindow || !e.data?.diji) return;
  if (e.data.kind === "error") {
    const msg = String(e.data.message || "Unknown error").slice(0, 400);
    if (ui.problems.some((p) => p.message === msg) || ui.problems.length >= 20) return;
    ui.problems.push({ message: msg, line: e.data.line });
    if (ui.problems.length === 1) toast(msg, "error", { title: "The preview hit an error", keep: false, action: { label: "Fix with Diji", run: previewHandlers.onFix } });
    renderPanel();
  }
  if (e.data.kind === "picked") {
    ui.picking = false;
    ui.picked = { selector: e.data.selector || "element", html: String(e.data.html || "").slice(0, 800), text: e.data.text };
    renderAttachments();
    renderPanel();
    input.placeholder = "What should change about this element?";
    input.focus();
    if (mq.mobile.matches) closePanel();
  }
  if (e.data.kind === "pickcancel") {
    ui.picking = false;
    renderPanel();
  }
});

/* ---------- import from GitHub ---------- */
function openImport() {
  const pop = $("#ship-pop");
  pop.innerHTML = `<form class="ship-form">
    <h3 id="ship-title">Import from GitHub</h3>
    <p class="muted">Bring a repository's code into a new chat so Diji can work on it. Public repos work without a token.</p>
    <label class="field"><span>Repository</span><input name="repo" placeholder="github.com/owner/repo" required spellcheck="false" autocomplete="off"></label>
    <div class="btn-row"><button class="btn-primary" type="submit">${icon("github", 16)} Import</button><button class="btn-ghost" type="button" data-cancel>Cancel</button></div>
    <p class="test-out" aria-live="polite"></p></form>`;
  pop.hidden = false;
  placePop(pop, ui.panelOpen ? $("#panel-body") : $("#composer"));
  const form = pop.querySelector("form");
  form.repo.focus();
  form.querySelector("[data-cancel]").onclick = () => (pop.hidden = true);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const out = form.querySelector(".test-out");
    out.className = "test-out";
    out.innerHTML = `<span class="spinner"></span> Reading the repository…`;
    ui.shipping = true;
    try {
      const r = await importFromGitHub(form.repo.value, githubToken());
      const chat = newChat();
      chat.title = r.name;
      commitChanges(chat, r.files, `Imported ${r.name}`);
      save();
      pop.hidden = true;
      renderAll();
      openPanel("code");
      toast(`Imported ${Object.keys(r.files).length} files from ${r.name}${r.skipped ? ` (${r.skipped} skipped for size)` : ""}. Ask Diji anything about it.`, "success");
      input.placeholder = `Ask Diji about ${r.name}…`;
      input.focus();
    } catch (err) {
      out.className = "test-out err";
      out.textContent = err.message === "Failed to fetch" ? "Could not reach GitHub." : err.message;
    } finally {
      ui.shipping = false;
    }
  };
}

/* ---------- composer meta: project + permission ---------- */
function renderMeta() {
  const chat = activeChat();
  const pid = chat ? chat.projectId : ui.pendingProject;
  const proj = state.projects.find((x) => x.id === pid);
  $("#project-btn").innerHTML = `${icon("folder", 14)}<span>${proj ? esc(proj.name) : "No project"}</span>${icon("chevronDown", 13)}`;
  $("#project-btn").hidden = Boolean(chat?.incognito);
  const auto = state.settings.autoApply !== false;
  $("#perm-btn").innerHTML = `${icon(auto ? "zap" : "shield", 14)}<span>${auto ? "Auto" : "Review"}</span>`;
  $("#perm-btn").title = auto ? "Diji applies file changes on its own" : "You approve every file change";
  const tag = $("#incog-tag");
  tag.hidden = !chat?.incognito;
  tag.innerHTML = `${icon("ghost", 13)} Incognito`;
}

function menu(anchor, items, { width = 260 } = {}) {
  const pop = $("#menu-pop");
  pop.innerHTML = `<div class="pop-scroll">${items
    .map((it, i) => (it === "-" ? `<hr>` : it.heading ? `<h3 class="menu-h">${esc(it.heading)}</h3>` : `<button role="menuitem" class="pop-item${it.danger ? " danger" : ""}" data-i="${i}" ${it.checked ? 'aria-checked="true"' : ""}>${it.icon ? icon(it.icon, 15) : ""}<span>${esc(it.label)}${it.desc ? `<small>${esc(it.desc)}</small>` : ""}</span>${it.checked ? icon("check", 14) : ""}</button>`))
    .join("")}</div>`;
  pop.hidden = false;
  placePop(pop, anchor);
  pop.style.width = Math.min(width, innerWidth - 16) + "px";
  pop.querySelector("button")?.focus({ preventScroll: true });
  pop.onclick = (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    closePops();
    items[b.dataset.i].run();
  };
}

$("#project-btn").onclick = (e) => {
  e.stopPropagation();
  const chat = activeChat();
  const cur = chat ? chat.projectId : ui.pendingProject;
  const assign = (pid) => {
    if (chat) {
      chat.projectId = pid || undefined;
      if (!pid) delete chat.projectId;
      save();
      toast(pid ? `This chat now uses “${projectOf(chat).name}”.` : "Removed from the project.", "info", { keep: false });
    } else ui.pendingProject = pid;
    renderMeta();
    renderChatList();
    if (!chat || !chat.messages.length) renderThread();
  };
  menu($("#project-btn"), [
    { heading: "Use project" },
    { label: "No project", icon: "chat", checked: !cur, run: () => assign(null) },
    ...state.projects.map((p) => ({ label: p.name, icon: "folder", checked: p.id === cur, run: () => assign(p.id) })),
    "-",
    { label: "New project…", icon: "plus", run: () => { const n = prompt("Project name"); if (n) assign(createProject(n).id); } },
    { label: "Manage projects", icon: "settings", run: () => setView("projects") },
  ]);
};

$("#perm-btn").onclick = (e) => {
  e.stopPropagation();
  const set = (v) => {
    state.settings.autoApply = v;
    save();
    renderMeta();
  };
  menu($("#perm-btn"), [
    { heading: "Permission mode" },
    { label: "Review", icon: "shield", desc: "Diji asks before changing any file", checked: state.settings.autoApply === false, run: () => set(false) },
    { label: "Auto", icon: "zap", desc: "Diji writes files on its own; undo anything from History", checked: state.settings.autoApply !== false, run: () => set(true) },
  ], { width: 300 });
};

/* ---------- chat menu: rename, star, move, export, delete ---------- */
function chatMarkdown(chat) {
  const lines = [`# ${chat.title}`, ""];
  for (const m of chat.messages) {
    if (m.role === "tool") continue;
    lines.push(`## ${m.role === "user" ? "You" : "Diji"}`, "", m.role === "assistant" ? m.content.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim() : m.content, "");
  }
  return lines.join("\n");
}
$("#chat-menu-btn").onclick = (e) => {
  e.stopPropagation();
  const chat = activeChat();
  if (!chat) return;
  const slugName = chat.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "diji-chat";
  menu($("#chat-menu-btn"), [
    { label: chat.starred ? "Unstar" : "Star", icon: "star", run: () => { chat.starred = !chat.starred; save(); renderChatList(); } },
    { label: "Rename", icon: "pencil", run: () => { const t = prompt("Rename chat", chat.title); if (t?.trim()) { chat.title = t.trim().slice(0, 80); save(); renderChatList(); renderTitle(); } } },
    { label: "Move to project", icon: "folder", run: () => $("#project-btn").click() },
    "-",
    { label: "Copy as Markdown", icon: "copy", run: async () => { await navigator.clipboard.writeText(chatMarkdown(chat)).catch(() => {}); toast("Chat copied as Markdown.", "success", { keep: false }); } },
    { label: "Export as Markdown", icon: "download", run: () => downloadBlob(new Blob([chatMarkdown(chat)], { type: "text/markdown" }), `${slugName}.md`) },
    "-",
    { label: "Delete chat", icon: "trash", danger: true, run: () => { deleteChat(chat.id); renderAll(); toast("Chat deleted.", "info", { keep: false }); } },
  ]);
};

/* ---------- incognito ---------- */
$("#incognito-btn").onclick = () => {
  const cur = activeChat();
  if (cur?.incognito) {
    // Leaving incognito: start a normal chat; the incognito one is forgotten.
    newChat();
    toast("Incognito chat closed and forgotten.", "info", { keep: false });
  } else {
    if (ui.busy) ui.abort?.abort();
    newChat({ incognito: true, title: "Incognito chat" });
    toast("Incognito: this chat is not saved and Diji will not remember anything from it.", "info", { keep: false });
  }
  setView("chat");
  input.focus();
};

/* ---------- voice mode (hands-free) ---------- */
const voice = { on: false };
async function voiceLoop() {
  const st = $("#voice-state"), heard = $("#voice-heard"), m = $("#voice-mascot");
  while (voice.on) {
    st.textContent = "Listening…";
    heard.textContent = "";
    setMood(m, "idle");
    let text = "";
    try {
      text = await listenOnce((t) => (heard.textContent = t));
    } catch (err) {
      toast(err.message, "error", { keep: false });
      break;
    }
    if (!voice.on) break;
    if (!text.trim()) continue;
    st.textContent = "Diji is thinking…";
    setMood(m, "thinking");
    await send(text.trim());
    while (ui.busy) await new Promise((r) => setTimeout(r, 250));
    if (!voice.on) break;
    const chat = activeChat();
    const last = [...(chat?.messages || [])].reverse().find((x) => x.role === "assistant");
    if (!last) continue;
    st.textContent = "Speaking…";
    setMood(m, "happy");
    await new Promise((r) => speak(last.content, { onend: r }));
  }
  stopVoice();
}
function stopVoice() {
  voice.on = false;
  listenOnce.stop();
  stopSpeaking();
  $("#voice-overlay").hidden = true;
}
$("#voice-btn").onclick = () => {
  if (ui.busy) return;
  voice.on = true;
  $("#voice-mascot").innerHTML = diji(96, "idle");
  $("#voice-overlay").hidden = false;
  voiceLoop();
};
$("#voice-stop").onclick = stopVoice;

/* ---------- keyboard shortcuts help ---------- */
function openHelp() {
  const d = $("#help-modal");
  const rows = [
    ["Ctrl K", "New chat"], ["/", "Focus the message box"], ["Enter", "Send (Shift+Enter for a new line)"], ["@", "Mention a file or a web page"],
    ["Esc", "Close menus, stop picking an element"], ["Ctrl S", "Save while editing a file"], ["Ctrl /", "Show this list"],
  ];
  d.innerHTML = `<div class="modal-card help-card"><div class="modal-head"><h2 id="help-title">Keyboard shortcuts</h2><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <dl class="keys">${rows.map(([k, v]) => `<div><dt>${k.split(" ").map((x) => `<kbd>${x}</kbd>`).join(" ")}</dt><dd>${v}</dd></div>`).join("")}</dl></div>`;
  d.querySelector("[data-close]").onclick = () => d.close();
  d.onclick = (e) => {
    if (e.target === d) d.close();
  };
  d.showModal();
}

/* ---------- modes, voice, enhancer, mentions ---------- */
const MODES = {
  build: { label: "Build", icon: "hammer", desc: "Writes and changes files" },
  plan: { label: "Plan", icon: "map", desc: "Thinks it through first, no file changes" },
  ask: { label: "Ask", icon: "help", desc: "Explains and answers, no file changes" },
  research: { label: "Research", icon: "telescope", desc: "Searches and reads the web, then reports with sources" },
};
function setMode(m) {
  state.settings.mode = m;
  save();
  renderModeBtn();
}
function renderModeBtn() {
  const m = MODES[state.settings.mode] || MODES.build;
  const b = $("#mode-btn");
  b.innerHTML = `${icon(m.icon, 15)}<span class="lbl-full">${m.label}</span>${icon("chevronDown", 13)}`;
  b.setAttribute("aria-label", `Mode: ${m.label}. Change mode`);
  b.dataset.mode = state.settings.mode || "build";
}
$("#mode-btn").onclick = (e) => {
  e.stopPropagation();
  const pop = $("#mode-pop");
  if (!pop.hidden) return closePops();
  closePops();
  const cur = state.settings.mode || "build";
  pop.innerHTML = `<div class="pop-scroll">${Object.entries(MODES)
    .map(([k, m]) => `<button role="option" class="pop-item mode-item" data-mode="${k}" aria-selected="${k === cur}">${icon(m.icon, 16)}<span><strong>${m.label}</strong><small>${m.desc}</small></span></button>`)
    .join("")}</div>`;
  pop.hidden = false;
  placePop(pop, $("#mode-btn"));
  pop.style.width = Math.min(280, innerWidth - 16) + "px";
  pop.onclick = (ev) => {
    const it = ev.target.closest("[data-mode]");
    if (!it) return;
    setMode(it.dataset.mode);
    closePops();
    input.focus();
  };
};

$("#enhance-btn").onclick = async () => {
  const before = input.value.trim();
  if (before.length < 4 || ui.busy) return;
  const b = $("#enhance-btn");
  b.disabled = true;
  b.classList.add("working");
  try {
    const better = await enhancePrompt(before);
    if (better) {
      input.value = better;
      autosize();
      toast("Prompt enhanced.", "success", { keep: false, action: { label: "Undo", run: () => { input.value = before; autosize(); } } });
    }
  } catch (err) {
    toast(err.message, "error", { title: "Could not enhance the prompt", keep: false });
  } finally {
    b.classList.remove("working");
    updateSend();
  }
};

// Voice prompting with the browser's speech recognition (bolt.diy-style).
let rec = null;
if (!Speech) $("#mic-btn").hidden = true;
$("#mic-btn").onclick = () => {
  if (rec) return rec.stop();
  rec = new Speech();
  rec.lang = state.settings.voiceLang || navigator.language || "en-IN";
  rec.interimResults = true;
  rec.continuous = true;
  const base = input.value ? input.value.trimEnd() + " " : "";
  rec.onresult = (ev) => {
    input.value = base + [...ev.results].map((r) => r[0].transcript).join("");
    autosize();
  };
  rec.onerror = (ev) => toast(ev.error === "not-allowed" ? "Allow microphone access to talk to Diji." : `Voice input stopped: ${ev.error}`, "error", { keep: false });
  rec.onend = () => {
    rec = null;
    $("#mic-btn").classList.remove("live");
    $("#mic-btn").setAttribute("aria-pressed", "false");
  };
  rec.start();
  $("#mic-btn").classList.add("live");
  $("#mic-btn").setAttribute("aria-pressed", "true");
};

// @ autocomplete for workspace files and pages.
function mentionQuery() {
  const upto = input.value.slice(0, input.selectionStart);
  const m = upto.match(/(?:^|\s)@([\w./:-]*)$/);
  return m ? m[1] : null;
}
function renderMentionPop() {
  const pop = $("#mention-pop");
  const q = mentionQuery();
  const chat = activeChat();
  if (q === null) return (pop.hidden = true);
  const files = Object.keys(chat?.files || {}).filter((p) => p.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  const items = files.map((p) => `<button class="pop-item" data-mention="${esc(p)}">${icon("file", 14)}<span>${esc(p)}</span></button>`);
  items.push(`<div class="pop-hint">${icon("globe", 13)} Type <code>@https://…</code> and Diji reads that page first</div>`);
  pop.innerHTML = `<div class="pop-scroll">${items.join("")}</div>`;
  pop.hidden = false;
  placePop(pop, $("#composer-input"));
  pop.onclick = (ev) => {
    const it = ev.target.closest("[data-mention]");
    if (!it) return;
    const pos = input.selectionStart;
    const start = input.value.slice(0, pos).lastIndexOf("@");
    input.value = input.value.slice(0, start) + "@" + it.dataset.mention + " " + input.value.slice(pos);
    pop.hidden = true;
    input.focus();
    autosize();
  };
}
input.addEventListener("input", renderMentionPop);
input.addEventListener("blur", () => setTimeout(() => ($("#mention-pop").hidden = true), 150));
document.querySelectorAll("#panel .tab").forEach((t) => (t.onclick = () => openPanel(t.dataset.tab)));
$("#panel").addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("tab") || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const tabs = [...document.querySelectorAll("#panel .tab")];
  const next = tabs[(tabs.indexOf(e.target) + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
  next.focus();
  openPanel(next.dataset.tab);
});
$("#panel-close").onclick = closePanel;
$("#files-btn").onclick = () => (ui.panelOpen && ui.panelTab !== "browser" ? closePanel() : openPanel(buildPreview((activeChat() || { files: {} }).files) ? "preview" : "code"));
$("#browser-btn").onclick = () => (ui.panelOpen && ui.panelTab === "browser" ? closePanel() : openPanel("browser"));
$("#zip-btn").onclick = () => {
  const chat = activeChat();
  if (!chat) return;
  const name = chat.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "diji-project";
  downloadBlob(zip(chat.files), `${name}.zip`);
  toast(`Downloaded ${Object.keys(chat.files).length} files as ${name}.zip`, "success", { keep: false });
};
$("#open-tab").onclick = () => {
  const html = buildPreview((activeChat() || { files: {} }).files);
  if (!html) return;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/* ---------- ship: GitHub and Vercel ---------- */
function openShip(kind) {
  const chat = activeChat();
  if (!chat || !Object.keys(chat.files).length) return;
  const isGh = kind === "github";
  if (!(isGh ? githubToken() : vercelToken())) {
    toast(`Connect your ${isGh ? "GitHub" : "Vercel"} account first.`, "info", { keep: false });
    return openSettings("deploy");
  }
  chat.ship ||= {};
  const prev = isGh ? chat.ship.github : chat.ship.vercel;
  const name = prev?.name || slug(chat.title);
  const pop = $("#ship-pop");
  pop.innerHTML = `<form class="ship-form">
    <h3 id="ship-title">${isGh ? "Push to GitHub" : "Deploy to Vercel"}</h3>
    <p class="muted">${isGh
      ? `Saves all ${Object.keys(chat.files).length} workspace files to a repository on your GitHub${prev ? `, as a new commit on <strong>${esc(prev.name)}</strong>` : ""}.`
      : `Puts the workspace live on your Vercel account${prev ? ` and updates <strong>${esc(prev.name)}</strong>` : ""}.`}</p>
    <label class="field"><span>${isGh ? "Repository name" : "Project name"}</span><input name="name" value="${esc(name)}" required spellcheck="false" autocomplete="off"></label>
    ${isGh ? `<label class="switch"><input type="checkbox" name="priv"${prev?.private ? " checked" : ""}><span class="track"></span><span>Private repository</span></label>
      <label class="field"><span>Commit message</span><input name="msg" value="${prev ? "Update from Diji" : "First version, built with Diji"}" autocomplete="off"></label>` : ""}
    <div class="btn-row"><button class="btn-primary" type="submit">${icon(isGh ? "github" : "cloudUp", 16)} ${isGh ? "Push" : "Deploy"}</button>
      <button class="btn-ghost" type="button" data-cancel>Cancel</button></div>
    <p class="test-out" aria-live="polite"></p></form>`;
  pop.hidden = false;
  placePop(pop, $(isGh ? "#gh-push-btn" : "#vercel-btn"));
  const form = pop.querySelector("form");
  form.name.focus();
  form.name.select();
  form.querySelector("[data-cancel]").onclick = () => (pop.hidden = true);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const out = form.querySelector(".test-out");
    const btn = form.querySelector("[type=submit]");
    const target = slug(form.name.value);
    btn.disabled = true;
    ui.shipping = true;
    out.className = "test-out";
    out.innerHTML = `<span class="spinner"></span> ${isGh ? "Pushing to GitHub…" : "Deploying, this takes a few seconds…"}`;
    try {
      if (isGh) {
        const r = await pushToGitHub(chat.files, { repo: target, isPrivate: form.priv.checked, message: form.msg.value.trim() });
        chat.ship.github = { name: r.repo, url: r.url, private: form.priv.checked };
        out.className = "test-out ok";
        out.innerHTML = `Pushed ${r.files} files to <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.fullName)}</a>.`;
        toast(`${r.files} files are on GitHub in ${r.fullName}.`, "success", { title: "Pushed to GitHub", action: { label: "Open", run: () => open(r.url, "_blank", "noopener") } });
        systemNotify("Pushed to GitHub", r.fullName);
      } else {
        const r = await deployToVercel(chat.files, { name: target });
        chat.ship.vercel = { name: target, url: r.url };
        out.className = "test-out ok";
        out.innerHTML = `${r.ready ? "Live at" : "Building at"} <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace("https://", ""))}</a>.`;
        toast(r.ready ? `Your site is live at ${r.url.replace("https://", "")}.` : "Vercel is still building. The link works in a moment.", "success", { title: "Deployed to Vercel", action: { label: "Open", run: () => open(r.url, "_blank", "noopener") } });
        systemNotify("Deployed to Vercel", r.url);
      }
      save();
      setMood(document.querySelector(".msg.assistant:last-of-type .avatar"), "happy");
    } catch (err) {
      out.className = "test-out err";
      out.textContent = err.message === "Failed to fetch" ? "Could not reach the service. Check your connection and try again." : err.message;
    } finally {
      btn.disabled = false;
      ui.shipping = false;
    }
  };
}
$("#gh-push-btn").onclick = (e) => {
  e.stopPropagation();
  closePops();
  openShip("github");
};
$("#vercel-btn").onclick = (e) => {
  e.stopPropagation();
  closePops();
  openShip("vercel");
};

/* ---------- wiring ---------- */
function renderAll() {
  renderChatList();
  renderTitle();
  renderThread();
  renderFilesCount();
  renderModelBtn();
  renderSkillsBtn();
  renderModeBtn();
  renderMeta();
  ui.problems = [];
  if (ui.panelOpen) renderPanel();
}

$("#new-chat").onclick = () => {
  ui.pendingProject = null;
  if (ui.view !== "chat") setView("chat");
  if (ui.busy) ui.abort?.abort();
  const cur = activeChat();
  if (!cur || cur.messages.length) newChat();
  renderAll();
  if (!mq.wide.matches) setSidebar(false);
  input.focus();
};
$("#chat-search").addEventListener("input", renderChatList);
$("#side-close").onclick = () => setSidebar(false);
$("#side-open").onclick = () => setSidebar(true);
$("#scrim").onclick = () => {
  if (ui.panelOpen && !mq.wide.matches) closePanel();
  setSidebar(false);
};
$("#open-settings").onclick = () => openSettings();
$("#open-skills").onclick = openSkills;
$("#skills-btn").onclick = openSkills;
$("#theme-btn").onclick = () => {
  const order = ["system", "light", "dark"];
  state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % 3];
  save();
  applyTheme();
};
onSettingsChange(() => {
  applyTheme();
  renderModelBtn();
  renderSkillsBtn();
  renderChatList();
  if (!activeChat()?.messages.length) renderThread();
  if (ui.panelOpen) renderPanel();
});
onNotificationsChange(renderBell);

addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "/") {
    e.preventDefault();
    openHelp();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("#new-chat").click();
  }
  if (e.key === "Escape") {
    if (voice.on) stopVoice();
    else if (ui.picking) previewHandlers.onPick();
    else if (!$("#model-pop").hidden || !$("#notif-pop").hidden || !$("#mode-pop").hidden || !$("#mention-pop").hidden) closePops();
    else if (ui.panelOpen && !mq.wide.matches) closePanel();
    else if (document.body.classList.contains("side-open") && !mq.wide.matches) setSidebar(false);
  }
  if (e.key === "/" && document.activeElement === document.body) {
    e.preventDefault();
    input.focus();
  }
});
mq.wide.addEventListener("change", () => setSidebar(mq.wide.matches && state.settings.sidebarOpen));
addEventListener("resize", () => !$("#model-pop").hidden && closePops());

// Show which skills will be used as the person types, so auto-pick is never a mystery.
let hintTimer;
input.addEventListener("input", () => {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    const s = activeSkills(input.value);
    const b = $("#skills-btn");
    b.title = s.length ? `Skills for this message: ${s.map((k) => k.name).join(", ")}` : "No skills match this message yet";
    b.classList.toggle("lit", s.length > 0 && input.value.length > 8);
  }, 250);
});

async function boot() {
  paintIcons();
  applyTheme();
  setSidebar(mq.wide.matches && state.settings.sidebarOpen !== false);
  await Promise.all([loadSkills(), checkCloud()]);
  if (!activeChat() && state.chats.length) state.activeId = state.chats[0].id;
  renderAll();
  renderBell();
  updateSend();
  // Re-highlight once highlight.js arrives from the CDN.
  if (!window.hljs) addEventListener("load", () => window.hljs && activeChat()?.messages.length && renderThread(), { once: true });
  if (!mq.mobile.matches) input.focus();
  if (!localStorage.getItem("diji:welcomed")) {
    try {
      localStorage.setItem("diji:welcomed", "1");
    } catch {}
    toast("You are on Diji Free. Add your own OpenAI, Claude or any model key in Settings for more power.", "info", {
      title: "Welcome to Diji",
      action: { label: "Add a key", run: () => openSettings("models", "openai") },
    });
  }
  window.__diji = { state, browserCall, serverConfigured };
}
boot();

document.addEventListener("diji:error", (e) => toast(e.detail, "error", { keep: false }));
