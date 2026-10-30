// Diji app shell: sidebar, thread, composer, workspace panel, popovers. Plain DOM, no framework.
import { state, save, activeChat, newChat, deleteChat, uid } from "./store.js";
import { PROVIDERS, providerById } from "../shared/catalog.js";
import { icon } from "./icons.js";
import { diji, setMood } from "./mascot.js";
import { esc, renderMarkdown, segments } from "./markdown.js";
import { runAgent } from "./agent.js";
import { renderPreview, renderCode, buildPreview, zip, downloadBlob } from "./workspace.js";
import { renderBrowser, cloud, browserCall, serverConfigured } from "./browser.js";
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
  attachments: [], // { name, text }
  msgEls: new Map(),
  pending: new Map(),
  stick: true,
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
  $("#open-tab").innerHTML = icon("external", 17);
  $("#zip-btn").innerHTML = icon("download", 17);
  $("#gh-push-btn").innerHTML = icon("github", 17);
  $("#vercel-btn").innerHTML = icon("cloudUp", 17);
  $("#panel-close").innerHTML = icon("x");
  $("#jump").innerHTML = icon("arrowDown", 18);
  $("#drop-ic").innerHTML = icon("upload", 28);
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

function renderChatList() {
  const q = $("#chat-search").value.trim().toLowerCase();
  const list = $("#chat-list");
  const chats = state.chats.filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.role === "user" && m.content.toLowerCase().includes(q)));
  if (!chats.length) {
    list.innerHTML = `<p class="side-empty">${q ? "No chats match." : "Your chats will live here."}</p>`;
    return;
  }
  let html = "";
  let last = "";
  for (const c of chats) {
    const g = groupLabel(c.updated);
    if (g !== last) html += `<h2 class="side-group">${g}</h2>`;
    last = g;
    html += `<div class="chat-item${c.id === state.activeId ? " on" : ""}" data-id="${c.id}">
      <button class="chat-link" data-open="${c.id}" ${c.id === state.activeId ? 'aria-current="page"' : ""}>${esc(c.title)}</button>
      <button class="icon-btn tiny" data-rename="${c.id}" aria-label="Rename chat">${icon("pencil", 14)}</button>
      <button class="icon-btn tiny" data-delete="${c.id}" aria-label="Delete chat">${icon("trash", 14)}</button></div>`;
  }
  list.innerHTML = html;
}

$("#chat-list").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]")?.dataset.open;
  const ren = e.target.closest("[data-rename]")?.dataset.rename;
  const del = e.target.closest("[data-delete]")?.dataset.delete;
  if (open) {
    if (ui.busy) ui.abort?.abort();
    state.activeId = open;
    save();
    renderAll();
    if (!mq.wide.matches) setSidebar(false);
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

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil?" : h < 12 ? "Good morning! What are we building?" : h < 17 ? "Good afternoon! What are we building?" : h < 22 ? "Good evening! What are we building?" : "Late-night build session?";
}

function renderEmpty(thread) {
  thread.innerHTML = `<div class="empty">
    <div class="empty-mascot">${diji(88, "happy")}</div>
    <h2 class="empty-title">${greeting()}</h2>
    <p class="empty-sub">I'm Diji. I write code you can run, preview it live, and look things up in a real browser when I need to.</p>
    <div class="starters">${STARTERS.map((s, i) => `<button class="starter" data-starter="${i}"><strong>${s.t}</strong><span>${s.d}</span></button>`).join("")}</div>
  </div>`;
  thread.querySelectorAll("[data-starter]").forEach((b) => (b.onclick = () => {
    const input = $("#composer-input");
    input.value = STARTERS[b.dataset.starter].p;
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
      ${m.files?.length ? `<div class="att-row">${m.files.map((f) => `<span class="att">${icon("file", 13)}${esc(f)}</span>`).join("")}</div>` : ""}
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

function fileCard(s, chat) {
  const lines = s.code ? s.code.split("\n").length : 0;
  const isNew = chat && chat.files[s.path] === s.code;
  return `<button class="file-card${s.done ? "" : " writing"}" data-file="${esc(s.path)}">
    <span class="file-ic">${icon("file", 16)}</span>
    <span class="file-meta"><strong>${esc(s.path)}</strong><span>${s.done ? `${lines} lines${isNew ? "" : " · older version"}` : `Writing… ${lines} lines`}</span></span>
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
      else if (s.type === "file") html += fileCard(s, chat);
      else if (s.type === "error") html += `<div class="callout err">${icon("alert", 16)}<span>${esc(s.text)}</span></div>`;
      else if (s.type === "tool" && s.tool === "delete") html += `<div class="chip-note">${icon("trash", 13)} Deleted ${esc(s.args.path || "")}</div>`;
    }
    if (m.streaming) html += `<span class="caret" aria-hidden="true"></span>`;
    content.innerHTML = html;
  }
  if (m.error) content.insertAdjacentHTML("beforeend", `<div class="callout err">${icon("alert", 16)}<span>${esc(m.error)}</span><button class="btn-ghost sm" data-fix-settings>Open settings</button></div>`);
  const isLast = chat && lastAssistantId(chat) === m.id;
  foot.innerHTML = m.streaming
    ? ""
    : `<div class="msg-actions">
        <button class="icon-btn tiny" data-copy-msg aria-label="Copy reply">${icon("copy", 14)}</button>
        ${isLast ? `<button class="icon-btn tiny" data-retry aria-label="Regenerate reply">${icon("refresh", 14)}</button>` : ""}
        ${m.stopped ? `<span class="muted sm">Stopped</span>` : ""}
        <span class="meta">${esc(m.model || "")}${m.skills?.length ? ` · ${m.skills.map(esc).join(", ")}` : ""}</span></div>`;
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
    openPanel("code");
    return;
  }
  if (e.target.closest("[data-open-browser]")) {
    if (msg?.shot) cloud.last = { url: msg.url, title: msg.title, shot: msg.shot };
    openPanel("browser");
    return;
  }
  if (e.target.closest("[data-fix-settings]")) return openSettings("models", state.settings.model.provider);
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
    chat.messages.splice(i + 1);
    save();
    renderThread();
    run(chat);
  }
});

function renderTitle() {
  const chat = activeChat();
  $("#chat-title").textContent = chat?.title || "New chat";
  document.title = chat && chat.messages.length ? `${chat.title} · Diji` : "Diji — the joyful coding agent";
}

/* ---------- composer ---------- */
const input = $("#composer-input");
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
}

function renderModelBtn() {
  const { provider, model } = state.settings.model;
  const p = providerById(provider);
  $("#model-btn").innerHTML = `<span class="model-name">${esc(model)}</span><span class="model-prov">${esc(p?.name || provider)}</span>${icon("chevronDown", 15)}`;
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
async function addFiles(fileList) {
  for (const f of fileList) {
    if (!TEXT_EXT.test(f.name) && !f.type.startsWith("text/")) {
      toast(`${f.name} is not a text or code file, so Diji cannot read it yet.`, "error", { keep: false });
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
  box.hidden = !ui.attachments.length;
  box.innerHTML = ui.attachments
    .map((a, i) => `<span class="att">${icon("file", 13)}${esc(a.name)}<button type="button" data-rm-att="${i}" aria-label="Remove ${esc(a.name)}">${icon("x", 12)}</button></span>`)
    .join("");
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
  const text = input.value.trim();
  if (!text && !ui.attachments.length) return;
  const chat = activeChat() || newChat();
  const attachments = ui.attachments.map((a) => `\n\n<attached-file name="${a.name}">\n${a.text}\n</attached-file>`).join("");
  chat.messages.push({ id: uid(), role: "user", content: text || "Here are some files.", attachments, files: ui.attachments.map((a) => a.name) });
  if (chat.title === "New chat") chat.title = (text || ui.attachments[0].name).replace(/\s+/g, " ").slice(0, 60);
  chat.updated = Date.now();
  input.value = "";
  ui.attachments = [];
  renderAttachments();
  autosize();
  save();
  renderChatList();
  renderTitle();
  renderThread();
  run(chat);
});

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
      onFiles: (paths) => {
        wroteFiles = [...new Set([...wroteFiles, ...paths])];
        renderFilesCount();
        if (chat.id !== state.activeId) return;
        if (!ui.panelOpen && mq.wide.matches && buildPreview(chat.files)) openPanel("preview");
        else if (ui.panelOpen) renderPanel();
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
    <div class="pop-group"><h3>Bring your own key</h3>${others
      .map((p) => `<button class="pop-item muted-item" data-connect="${p.id}"><span>Connect ${esc(p.name)}</span>${icon("key", 14)}</button>`)
      .join("")}</div></div>`;
  pop.hidden = false;
  placePop(pop, $("#model-btn"));
  pop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
  pop.querySelector("button")?.focus({ preventScroll: true });
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
  $("#notif-pop").hidden = true;
  if (!ui.shipping) $("#ship-pop").hidden = true;
}
$("#model-btn").onclick = (e) => {
  e.stopPropagation();
  $("#model-pop").hidden ? (closePops(), openModelPop()) : closePops();
};
document.addEventListener("click", (e) => {
  if (!e.target.closest(".popover") && !e.target.closest("#model-btn") && !e.target.closest("#bell-btn") && !e.target.closest("#gh-push-btn") && !e.target.closest("#vercel-btn")) closePops();
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
  if (ui.panelTab === "preview") renderPreview(body, chat);
  if (ui.panelTab === "code") renderCode(body, chat, ui.codeFile, (p) => {
    ui.codeFile = p;
    renderPanel();
  });
  if (ui.panelTab === "browser") renderBrowser(body, { openSettings });
  syncTopButtons();
}
cloud.listeners.add(() => ui.panelTab === "browser" && renderPanel());
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
  if (ui.panelOpen) renderPanel();
}

$("#new-chat").onclick = () => {
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("#new-chat").click();
  }
  if (e.key === "Escape") {
    if (!$("#model-pop").hidden || !$("#notif-pop").hidden) closePops();
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
  await loadSkills();
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
