// Client for the cloud browser running on the Diji server (headless Chromium).
import { state, serverHeaders, uid } from "./store.js";
import { icon } from "./icons.js";
import { esc } from "./markdown.js";

const sessionId = (() => {
  try {
    return sessionStorage.getItem("diji:browser") || (sessionStorage.setItem("diji:browser", "s-" + uid()), sessionStorage.getItem("diji:browser"));
  } catch {
    return "s-" + uid();
  }
})();

// controller: who drives the browser. "diji" = the agent, "you" = the person (Claude-style take control).
export const cloud = { last: null, busy: false, error: "", available: true, controller: "diji", reason: "", listeners: new Set() };
const emit = () => cloud.listeners.forEach((fn) => fn());

const waiters = new Set();
let live = null;
export function setController(who, reason = "") {
  // While the person drives, refresh the view every few seconds so it feels live.
  clearInterval(live);
  if (who === "you") live = setInterval(() => cloud.last && !cloud.busy && document.querySelector(".cb") && browserCall("shot").catch(() => {}), 3000);
  cloud.controller = who;
  cloud.reason = who === "you" ? reason : "";
  if (who === "diji") {
    for (const w of waiters) w();
    waiters.clear();
  }
  emit();
}
// Resolves when Diji may use the browser again (right away unless the person has control).
export function waitForControl(signal) {
  if (cloud.controller === "diji") return Promise.resolve();
  return new Promise((resolve) => {
    waiters.add(resolve);
    signal?.addEventListener("abort", () => (waiters.delete(resolve), resolve()), { once: true });
  });
}
// The agent's browser calls wait politely while the person is driving.
export async function agentBrowserCall(action, body, signal) {
  if (cloud.controller === "you") document.dispatchEvent(new CustomEvent("diji:browser-wait"));
  await waitForControl(signal);
  return browserCall(action, body);
}

// Your own server when you set one with its token; otherwise Diji's built-in cloud browser.
export const ownServer = () => Boolean(state.settings.serverUrl && state.settings.serverToken);
const endpoint = (action) => (ownServer() ? state.settings.serverUrl.replace(/\/+$/, "") : "") + "/api/browser/" + action;
export const serverConfigured = () => ownServer() || cloud.available;

export async function checkCloud() {
  if (ownServer()) return (cloud.available = true);
  try {
    const j = await (await fetch("/api/browser/health", { signal: AbortSignal.timeout(8000) })).json();
    cloud.available = Boolean(j.ok);
  } catch {
    cloud.available = false;
  }
  emit();
  return cloud.available;
}

export async function browserCall(action, body = {}) {
  if (!serverConfigured()) throw new Error("Diji's cloud browser is offline right now.");
  cloud.busy = true;
  cloud.error = "";
  emit();
  try {
    const res = await fetch(endpoint(action), {
      method: "POST",
      headers: ownServer() ? serverHeaders() : { "content-type": "application/json" },
      body: JSON.stringify({ ...body, sessionId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Cloud browser answered ${res.status}.`);
    if (j.shot) cloud.last = { url: j.url, title: j.title, shot: j.shot };
    return j;
  } catch (e) {
    cloud.error = e.message === "Failed to fetch" ? (ownServer() ? "Could not reach your Diji server. Check the URL in Settings → Cloud." : "Could not reach Diji's cloud browser. Check your connection.") : e.message;
    throw new Error(cloud.error);
  } finally {
    cloud.busy = false;
    emit();
  }
}

export function renderBrowser(el, { openSettings }) {
  if (!serverConfigured()) {
    el.innerHTML = `<div class="panel-empty">${icon("globe", 28)}<p><strong>The cloud browser is offline</strong></p>
      <p>Diji's Chromium is not answering right now. Try again in a minute, or connect your own Diji server.</p>
      <button type="button" class="btn-ghost" data-open-cloud>${icon("cloud", 16)} Use my own server</button></div>`;
    el.querySelector("[data-open-cloud]").onclick = () => openSettings("cloud");
    return;
  }
  if (!el.querySelector(".cb")) {
    el.innerHTML = `<div class="cb">
      <div class="cb-control"></div>
      <form class="cb-bar">
        <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icon("arrowLeft", 16)}</button>
        <button type="button" class="icon-btn" data-act="forward" aria-label="Forward">${icon("arrowRight", 16)}</button>
        <button type="button" class="icon-btn" data-act="reload" aria-label="Reload">${icon("rotate", 16)}</button>
        <input class="cb-url" name="url" placeholder="Search or type a URL" autocomplete="off" spellcheck="false" aria-label="Address">
      </form>
      <div class="cb-view"><img class="cb-shot" alt="" draggable="false"><div class="cb-status" aria-live="polite"></div></div>
      <form class="cb-type">
        <span class="muted">${icon("keyboard", 15)}</span>
        <input name="text" placeholder="Click the page, then type here" autocomplete="off" aria-label="Type into page">
        <button type="button" class="btn-ghost sm" data-key="Enter">Enter</button>
        <button type="button" class="icon-btn" data-scroll="-600" aria-label="Scroll up">${icon("chevronUp", 16)}</button>
        <button type="button" class="icon-btn" data-scroll="600" aria-label="Scroll down">${icon("chevronDown", 16)}</button>
      </form></div>`;
    const run = (a, b) => browserCall(a, b).catch(() => {});
    const bar = el.querySelector(".cb-bar");
    bar.onsubmit = (e) => {
      e.preventDefault();
      run("open", { url: bar.url.value });
    };
    bar.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => run(b.dataset.act)));
    const img = el.querySelector(".cb-shot");
    el.querySelector(".cb-view").addEventListener("click", (e) => {
      if (cloud.controller !== "you" && e.target.closest("[data-take]")) setController("you", "");
    });
    img.onclick = (e) => {
      if (cloud.controller !== "you") return;
      const r = img.getBoundingClientRect();
      run("click", { x: ((e.clientX - r.left) / r.width) * 1280, y: ((e.clientY - r.top) / r.height) * 800 });
    };
    const typeForm = el.querySelector(".cb-type");
    typeForm.onsubmit = async (e) => {
      e.preventDefault();
      const t = typeForm.text.value;
      if (!t) return;
      typeForm.text.value = "";
      await run("type", { text: t });
    };
    typeForm.querySelector("[data-key]").onclick = () => run("key", { key: "Enter" });
    typeForm.querySelectorAll("[data-scroll]").forEach((b) => (b.onclick = () => run("scroll", { dy: Number(b.dataset.scroll) })));
  }
  const you = cloud.controller === "you";
  const ctl = el.querySelector(".cb-control");
  const stateKey = cloud.controller + "|" + cloud.reason;
  if (ctl.dataset.state !== stateKey) {
  ctl.dataset.state = stateKey;
  ctl.className = `cb-control${you ? " you" : ""}`;
  ctl.innerHTML = you
    ? `<span class="cb-who">${icon("pointer", 15)} <strong>You have control</strong>${cloud.reason ? `<span class="cb-reason">Diji asked: ${esc(cloud.reason)}</span>` : ""}</span>
       <input class="cb-note" placeholder="Note for Diji (optional)" aria-label="Note for Diji" value="${esc(ctl.querySelector(".cb-note")?.value || "")}">
       <button type="button" class="btn-primary sm" data-give>${icon("sparkles", 14)} Give back to Diji</button>`
    : `<span class="cb-who">${icon("sparkles", 15)} <strong>Diji has control</strong><span class="cb-reason">Take over to click, type or log in yourself.</span></span>
       <button type="button" class="btn-ghost sm" data-take>${icon("pointer", 14)} Take control</button>`;
  ctl.querySelector("[data-take]")?.addEventListener("click", () => setController("you", ""));
  ctl.querySelector("[data-give]")?.addEventListener("click", () => {
    cloud.note = ctl.querySelector(".cb-note").value.trim();
    setController("diji");
  });
  }
  el.querySelector(".cb-type").hidden = !you;
  el.querySelectorAll(".cb-bar input, .cb-bar button").forEach((x) => (x.disabled = !you));
  el.querySelector(".cb-view").classList.toggle("locked", !you);
  const img = el.querySelector(".cb-shot");
  const status = el.querySelector(".cb-status");
  const url = el.querySelector(".cb-url");
  if (cloud.last) {
    img.src = "data:image/jpeg;base64," + cloud.last.shot;
    img.alt = cloud.last.title ? `Screenshot of ${cloud.last.title}` : "Cloud browser screenshot";
    img.hidden = false;
    if (document.activeElement !== url) url.value = cloud.last.url.startsWith("data:") ? "Diji preview" : cloud.last.url;
  } else img.hidden = true;
  el.querySelector(".cb-view").classList.toggle("busy", cloud.busy);
  status.innerHTML = cloud.error
    ? `<span class="err">${esc(cloud.error)}</span>`
    : cloud.busy
      ? `<span class="spinner"></span> Working…`
      : !cloud.last
        ? `Type an address above, or ask Diji to look something up.`
        : "";
}
