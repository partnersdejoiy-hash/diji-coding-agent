// Settings (models + keys, cloud server, preferences, data) and the Skills library.
import { state, save, providerSettings } from "./store.js";
import { PROVIDERS, providerById } from "../shared/catalog.js";
import { icon } from "./icons.js";
import { esc } from "./markdown.js";
import { toast, askNotifyPermission } from "./notify.js";
import { testModel, fetchModels } from "./agent.js";
import { allSkills, togglePinned, importSkill, removeSkill } from "./skills.js";

const $ = (sel, root = document) => root.querySelector(sel);
export const isConnected = (p) => {
  const ps = providerSettings(p.id);
  if (p.custom && !ps.baseUrl) return false; // custom and self-hosted endpoints need a URL the person set
  return p.keyless || p.custom || Boolean(ps.key);
};

let onChange = () => {};
export function onSettingsChange(fn) {
  onChange = fn;
}

function modalShell(dialog, title, id, body) {
  dialog.innerHTML = `<div class="modal-card">
    <div class="modal-head"><h2 id="${id}">${title}</h2><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    ${body}</div>`;
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.onclick = (e) => e.target === dialog && dialog.close();
  if (!dialog.open) dialog.showModal();
}

/* ---------- Settings ---------- */

let currentTab = "models";
let currentProvider = null;

export function openSettings(tab = currentTab, providerId) {
  currentTab = tab;
  if (providerId) currentProvider = providerId;
  currentProvider ||= state.settings.model.provider;
  const dialog = $("#settings-modal");
  const tabs = [
    ["models", "Models & keys", "key"],
    ["cloud", "Cloud browser", "cloud"],
    ["deploy", "GitHub & Vercel", "github"],
    ["prefs", "Preferences", "settings"],
    ["data", "Data & privacy", "layers"],
  ];
  modalShell(
    dialog,
    "Settings",
    "settings-title",
    `<div class="settings">
      <nav class="settings-nav" role="tablist">${tabs
        .map(([id, label, ic]) => `<button role="tab" class="snav${id === tab ? " on" : ""}" data-tab="${id}" aria-selected="${id === tab}">${icon(ic, 16)}<span>${label}</span></button>`)
        .join("")}</nav>
      <div class="settings-body" id="settings-body"></div>
    </div>`,
  );
  dialog.querySelectorAll(".snav").forEach((b) => (b.onclick = () => openSettings(b.dataset.tab)));
  const body = $("#settings-body", dialog);
  ({ models: renderModels, cloud: renderCloud, deploy: renderDeploy, prefs: renderPrefs, data: renderData })[tab](body);
}

function renderModels(body) {
  const p = providerById(currentProvider) || PROVIDERS[0];
  const ps = providerSettings(p.id);
  const models = [...new Set([...(ps.models || []), ...p.models])];
  body.innerHTML = `<div class="prov">
    <ul class="prov-list" aria-label="Providers">${PROVIDERS.map(
      (x) => `<li><button class="prov-item${x.id === p.id ? " on" : ""}" data-id="${x.id}">
        <span class="dot ${isConnected(x) ? "ok" : ""}" aria-hidden="true"></span><span>${esc(x.name)}</span>
        ${isConnected(x) ? '<span class="sr-only">connected</span>' : ""}</button></li>`,
    ).join("")}</ul>
    <div class="prov-detail">
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(p.blurb || (p.keyless ? "No key needed." : "Bring your own key. It is stored only in this browser and sent only to " + p.name + "."))}</p>
      ${p.keyless && !p.custom ? "" : `
      <label class="field"><span>API key${p.keyless ? " (optional)" : ""}</span>
        <div class="input-row"><input type="password" id="pkey" value="${esc(ps.key || "")}" placeholder="${p.keyless ? "Leave empty if your server has no key" : "Paste your key"}" autocomplete="off" spellcheck="false">
        <button type="button" class="icon-btn" id="pkey-eye" aria-label="Show key">${icon("eye", 16)}</button></div>
        ${p.keyUrl ? `<a class="hint-link" href="${p.keyUrl}" target="_blank" rel="noopener">Get a ${esc(p.name)} key ${icon("external", 12)}</a>` : ""}
      </label>`}
      ${p.custom ? `
      <label class="field"><span>Base URL</span><input id="pbase" value="${esc(ps.baseUrl || p.baseUrl || "")}" placeholder="https://api.example.com/v1" spellcheck="false"></label>
      ${p.allowKind ? `<label class="field"><span>API style</span><select id="pkind">
        <option value="openai"${ps.kind !== "anthropic" ? " selected" : ""}>OpenAI-compatible (/chat/completions)</option>
        <option value="anthropic"${ps.kind === "anthropic" ? " selected" : ""}>Anthropic-compatible (/messages)</option></select></label>` : ""}
      ${p.local ? `<p class="note">${icon("info", 14)} Local addresses only work when chats go through a Diji server started with <code>ALLOW_LOCAL_LLM=1</code>.</p>` : ""}` : ""}
      <label class="field"><span>Model</span>
        <div class="input-row"><input id="pmodel" list="pmodels" value="${esc(state.settings.model.provider === p.id ? state.settings.model.model : models[0] || "")}" placeholder="model id" spellcheck="false">
        <button type="button" class="btn-ghost sm" id="pfetch">${icon("refresh", 14)} Fetch models</button></div>
        <datalist id="pmodels">${models.map((m) => `<option value="${esc(m)}">`).join("")}</datalist>
      </label>
      <div class="btn-row">
        <button type="button" class="btn-primary" id="puse">${icon("check", 16)} Use this model</button>
        <button type="button" class="btn-ghost" id="ptest">${icon("zap", 16)} Test connection</button>
      </div>
      <p class="test-out" id="ptest-out" aria-live="polite"></p>
    </div></div>`;
  body.querySelectorAll(".prov-item").forEach((b) => (b.onclick = () => {
    currentProvider = b.dataset.id;
    renderModels(body);
  }));
  const key = $("#pkey", body), base = $("#pbase", body), kind = $("#pkind", body), model = $("#pmodel", body);
  const persist = () => {
    if (key) ps.key = key.value.trim();
    if (base) ps.baseUrl = base.value.trim();
    if (kind) ps.kind = kind.value;
    save();
  };
  [key, base, kind].forEach((el) => el && el.addEventListener("change", persist));
  const eye = $("#pkey-eye", body);
  if (eye) eye.onclick = () => {
    key.type = key.type === "password" ? "text" : "password";
    eye.innerHTML = icon(key.type === "password" ? "eye" : "eyeOff", 16);
    eye.setAttribute("aria-label", key.type === "password" ? "Show key" : "Hide key");
  };
  $("#puse", body).onclick = () => {
    persist();
    if (!model.value.trim()) return toast("Type or fetch a model id first.", "error", { keep: false });
    state.settings.model = { provider: p.id, model: model.value.trim() };
    save();
    onChange();
    renderModels(body);
    toast(`Now chatting with ${model.value.trim()} on ${p.name}.`, "success", { keep: false });
  };
  $("#ptest", body).onclick = async () => {
    persist();
    const out = $("#ptest-out", body);
    out.className = "test-out";
    out.innerHTML = `<span class="spinner"></span> Asking ${esc(model.value)}…`;
    try {
      const reply = await testModel(p.id, model.value.trim());
      out.className = "test-out ok";
      out.textContent = `Connected. The model said: “${reply}”`;
    } catch (e) {
      out.className = "test-out err";
      out.textContent = e.message;
    }
  };
  $("#pfetch", body).onclick = async (e) => {
    persist();
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const list = await fetchModels(p.id);
      ps.models = list.slice(0, 300);
      save();
      $("#pmodels", body).innerHTML = list.map((m) => `<option value="${esc(m)}">`).join("");
      toast(`Found ${list.length} models on ${p.name}. Pick one from the Model field.`, "success", { keep: false });
    } catch (err) {
      toast(err.message, "error", { keep: false });
    } finally {
      btn.disabled = false;
    }
  };
}

function renderCloud(body) {
  const s = state.settings;
  body.innerHTML = `
    <h3>Cloud browser</h3>
    <p class="muted">Diji has its own Chromium in the cloud, already on for you: it searches, reads docs and tests what it builds. Nothing to set up. Only fill this in to use a private Diji server of your own (one command on an Oracle Always Free VM, see the README).</p>
    <label class="field"><span>Server URL</span><input id="surl" value="${esc(s.serverUrl)}" placeholder="https://141-148-1-2.sslip.io" spellcheck="false"></label>
    <label class="field"><span>Access token</span><input id="stoken" type="password" value="${esc(s.serverToken)}" placeholder="Printed by the setup script" autocomplete="off"></label>
    <fieldset class="field"><legend>Send chats through</legend>
      <label class="radio"><input type="radio" name="via" value="site"${s.chatVia !== "server" ? " checked" : ""}> This website (Vercel functions)</label>
      <label class="radio"><input type="radio" name="via" value="server"${s.chatVia === "server" ? " checked" : ""}> My Diji server (needed for local models)</label>
    </fieldset>
    <div class="btn-row"><button type="button" class="btn-primary" id="ssave">${icon("check", 16)} Save and check</button></div>
    <p class="test-out" id="sout" aria-live="polite"></p>`;
  $("#ssave", body).onclick = async () => {
    s.serverUrl = $("#surl", body).value.trim().replace(/\/+$/, "");
    s.serverToken = $("#stoken", body).value.trim();
    s.chatVia = body.querySelector("input[name=via]:checked").value;
    if (s.serverUrl && !/^https?:\/\//.test(s.serverUrl)) s.serverUrl = "https://" + s.serverUrl;
    save();
    onChange();
    const out = $("#sout", body);
    if (!s.serverUrl) {
      out.className = "test-out";
      out.textContent = "Saved. Diji uses its built-in cloud browser.";
      return;
    }
    out.className = "test-out";
    out.innerHTML = `<span class="spinner"></span> Checking ${esc(s.serverUrl)}…`;
    try {
      const j = await (await fetch(s.serverUrl + "/api/health", { signal: AbortSignal.timeout(10000) })).json();
      if (!j.ok) throw new Error("unexpected answer");
      out.className = "test-out ok";
      out.textContent = `Connected to your Diji server${j.auth ? " (token protected)" : ""}. The cloud browser is ready.`;
      toast("Cloud browser connected.", "success");
    } catch {
      out.className = "test-out err";
      out.textContent = location.protocol === "https:" && s.serverUrl.startsWith("http:")
        ? "Browsers block http servers from an https site. Use the https address the setup script printed."
        : "Could not reach the server. Check the URL, that ports 80/443 are open in Oracle, and that the server is running.";
    }
  };
}

function renderDeploy(body) {
  const g = providerSettings("github");
  const v = providerSettings("vercel");
  body.innerHTML = `
    <h3>GitHub & Vercel</h3>
    <p class="muted">Connect your own accounts to push what Diji builds to your GitHub and put it live on your Vercel. Tokens stay in this browser, like your API keys, and go only to GitHub and Vercel.</p>
    <label class="field"><span>GitHub token</span>
      <div class="input-row"><input type="password" id="dgh" value="${esc(g.key || "")}" placeholder="github_pat_… or ghp_…" autocomplete="off" spellcheck="false">
      <button type="button" class="btn-ghost sm" data-check="github">${icon("check", 14)} Check</button></div>
      <a class="hint-link" href="https://github.com/settings/tokens/new?scopes=repo&description=Diji%20coding%20agent" target="_blank" rel="noopener">Create a GitHub token (needs the “repo” scope) ${icon("external", 12)}</a>
    </label>
    <label class="field"><span>Vercel token</span>
      <div class="input-row"><input type="password" id="dvc" value="${esc(v.key || "")}" placeholder="Paste your Vercel token" autocomplete="off" spellcheck="false">
      <button type="button" class="btn-ghost sm" data-check="vercel">${icon("check", 14)} Check</button></div>
      <a class="hint-link" href="https://vercel.com/account/settings/tokens" target="_blank" rel="noopener">Create a Vercel token ${icon("external", 12)}</a>
    </label>
    <label class="field"><span>Vercel team ID or slug <small class="muted">(optional, leave empty for your personal account)</small></span>
      <input id="dteam" value="${esc(v.team || "")}" placeholder="team_… or my-team" spellcheck="false"></label>
    <p class="note">${icon("info", 14)} Then open the workspace and use <strong>Push to GitHub</strong> or <strong>Deploy to Vercel</strong>.</p>
    <p class="test-out" id="dout" aria-live="polite"></p>`;
  const persist = () => {
    g.key = $("#dgh", body).value.trim();
    v.key = $("#dvc", body).value.trim();
    v.team = $("#dteam", body).value.trim();
    save();
    onChange();
  };
  body.querySelectorAll("input").forEach((i) => i.addEventListener("change", persist));
  body.querySelectorAll("[data-check]").forEach((b) => (b.onclick = async () => {
    persist();
    const out = $("#dout", body);
    out.className = "test-out";
    out.innerHTML = '<span class="spinner"></span> Checking…';
    try {
      if (b.dataset.check === "github") {
        if (!g.key) throw new Error("Paste a GitHub token first.");
        const res = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${g.key}`, accept: "application/vnd.github+json" } });
        const j = await res.json();
        if (!res.ok) throw new Error(res.status === 401 ? "GitHub says this token is invalid or expired." : j.message || `GitHub answered ${res.status}.`);
        out.className = "test-out ok";
        out.textContent = `Connected to GitHub as @${j.login}.`;
      } else {
        if (!v.key) throw new Error("Paste a Vercel token first.");
        const res = await fetch("https://api.vercel.com/v2/user", { headers: { authorization: `Bearer ${v.key}` } });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 403 || res.status === 401 ? "Vercel says this token is invalid." : j.error?.message || `Vercel answered ${res.status}.`);
        out.className = "test-out ok";
        out.textContent = `Connected to Vercel as ${j.user?.username || j.user?.email || "you"}.`;
      }
    } catch (e) {
      out.className = "test-out err";
      out.textContent = e.message === "Failed to fetch" ? "Could not reach the service from this browser. The token is saved and Deploy will still try through Diji's server." : e.message;
    }
  }));
}

function renderPrefs(body) {
  const s = state.settings;
  body.innerHTML = `
    <h3>Preferences</h3>
    <fieldset class="field"><legend>Theme</legend><div class="seg">
      ${["system", "light", "dark"].map((t) => `<label><input type="radio" name="theme" value="${t}"${s.theme === t ? " checked" : ""}><span>${icon({ system: "monitor", light: "sun", dark: "moon" }[t], 15)} ${t[0].toUpperCase() + t.slice(1)}</span></label>`).join("")}
    </div></fieldset>
    <label class="switch"><input type="checkbox" id="penter"${s.enterToSend ? " checked" : ""}><span class="track"></span><span>Enter sends, Shift+Enter adds a line</span></label>
    <label class="switch"><input type="checkbox" id="pnotify"${s.systemNotify ? " checked" : ""}><span class="track"></span><span>Notify me when Diji finishes while I am in another tab</span></label>
    <label class="field"><span>Creativity <output id="ptempv">${s.temperature}</output></span>
      <input type="range" id="ptemp" min="0" max="1.2" step="0.1" value="${s.temperature}"><small class="muted">Lower is more precise, higher is more inventive.</small></label>`;
  body.querySelectorAll("input[name=theme]").forEach((r) => (r.onchange = () => {
    s.theme = r.value;
    save();
    onChange();
  }));
  $("#penter", body).onchange = (e) => {
    s.enterToSend = e.target.checked;
    save();
  };
  $("#pnotify", body).onchange = async (e) => {
    if (e.target.checked && !(await askNotifyPermission())) e.target.checked = false;
    s.systemNotify = e.target.checked;
    save();
  };
  $("#ptemp", body).oninput = (e) => {
    s.temperature = Number(e.target.value);
    $("#ptempv", body).textContent = s.temperature;
    save();
  };
}

function renderData(body) {
  const s = state.settings;
  body.innerHTML = `
    <h3>Data & privacy</h3>
    <p class="muted">Chats, files and keys live only in this browser. Keys go only to the provider they belong to, through a stateless proxy that never logs or stores them.</p>
    <label class="switch"><input type="checkbox" id="premember"${s.rememberKeys ? " checked" : ""}><span class="track"></span><span>Remember API keys on this device (off = forget when the tab closes)</span></label>
    <div class="btn-row">
      <button type="button" class="btn-ghost" id="dexport">${icon("download", 16)} Export chats</button>
      <label class="btn-ghost">${icon("upload", 16)} Import chats<input type="file" id="dimport" accept="application/json" hidden></label>
      <button type="button" class="btn-danger" id="dclear">${icon("trash", 16)} Delete everything</button>
    </div>`;
  $("#premember", body).onchange = (e) => {
    s.rememberKeys = e.target.checked;
    save();
  };
  $("#dexport", body).onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ chats: state.chats }, null, 2)], { type: "application/json" }));
    a.download = `diji-chats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $("#dimport", body).onchange = async (e) => {
    try {
      const j = JSON.parse(await e.target.files[0].text());
      const chats = (j.chats || []).filter((c) => c && c.id && Array.isArray(c.messages));
      const known = new Set(state.chats.map((c) => c.id));
      state.chats.push(...chats.filter((c) => !known.has(c.id)).map((c) => ({ files: {}, ...c })));
      save();
      onChange();
      toast(`Imported ${chats.length} chats.`, "success", { keep: false });
    } catch {
      toast("That file is not a Diji export.", "error", { keep: false });
    }
  };
  $("#dclear", body).onclick = () => {
    if (!confirm("Delete all chats, files, keys and settings from this browser? This cannot be undone.")) return;
    localStorage.removeItem("diji:v1");
    sessionStorage.clear();
    location.reload();
  };
}

/* ---------- Skills ---------- */

let skillQuery = "";

export function openSkills() {
  const dialog = $("#skills-modal");
  const s = state.settings;
  const q = skillQuery.toLowerCase();
  const list = allSkills().filter((k) => !q || (k.name + " " + k.description + " " + (k.tags || []).join(" ")).toLowerCase().includes(q));
  const scrollTop = dialog.querySelector(".skill-grid")?.scrollTop || 0;
  modalShell(
    dialog,
    "Skills",
    "skills-title",
    `<div class="skills">
      <p class="muted">Skills are playbooks Diji follows. Pin the ones you always want, or let Diji pick up to three that fit each message.</p>
      <div class="skills-tools">
        <label class="switch"><input type="checkbox" id="sauto"${s.autoSkills ? " checked" : ""}><span class="track"></span><span>Auto-pick skills per message</span></label>
        <label class="side-search grow">${icon("search", 15)}<input id="squery" type="search" value="${esc(skillQuery)}" placeholder="Search ${allSkills().length} skills" aria-label="Search skills"></label>
      </div>
      <div class="skill-grid">${list
        .map((k) => {
          const on = s.skills.includes(k.id);
          return `<div class="skill${on ? " on" : ""}">
            <div class="skill-top"><strong>${esc(k.name)}</strong>
              <label class="switch mini"><input type="checkbox" data-pin="${k.id}"${on ? " checked" : ""} aria-label="Pin ${esc(k.name)}"><span class="track"></span></label></div>
            <p>${esc(k.description)}</p>
            <div class="skill-tags">${(k.tags || []).slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join("")}
              ${k.builtin ? "" : `<button class="link-btn" data-remove="${k.id}">Remove</button>`}</div>
          </div>`;
        })
        .join("") || `<p class="muted">No skills match “${esc(skillQuery)}”.</p>`}</div>
      <details class="import">
        <summary>${icon("plus", 15)} Import a skill</summary>
        <p class="muted">Paste a link to any open-source <code>SKILL.md</code> (GitHub links work) or paste the file itself.</p>
        <div class="input-row"><input id="surl2" placeholder="https://github.com/owner/repo/blob/main/skills/x/SKILL.md" spellcheck="false"><button type="button" class="btn-primary" id="simport">Import</button></div>
        <textarea id="stext" rows="5" placeholder="---&#10;name: my-skill&#10;description: When to use it&#10;---&#10;# Instructions…"></textarea>
      </details>
    </div>`,
  );
  const grid = dialog.querySelector(".skill-grid");
  grid.scrollTop = scrollTop;
  $("#sauto", dialog).onchange = (e) => {
    s.autoSkills = e.target.checked;
    save();
    onChange();
  };
  const qi = $("#squery", dialog);
  qi.oninput = () => {
    skillQuery = qi.value;
    openSkills();
    const again = $("#squery", dialog);
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  };
  dialog.querySelectorAll("[data-pin]").forEach((c) => (c.onchange = () => {
    togglePinned(c.dataset.pin);
    c.closest(".skill").classList.toggle("on", c.checked);
    onChange();
  }));
  dialog.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = () => {
    removeSkill(b.dataset.remove);
    openSkills();
    onChange();
  }));
  $("#simport", dialog).onclick = async () => {
    try {
      const k = await importSkill({ url: $("#surl2", dialog).value, text: $("#stext", dialog).value });
      toast(`Added “${k.name}” and pinned it.`, "success");
      openSkills();
      onChange();
    } catch (e) {
      toast(e.message, "error", { keep: false });
    }
  };
}
