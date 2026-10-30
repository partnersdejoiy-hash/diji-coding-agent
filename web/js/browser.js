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

export const cloud = { last: null, busy: false, error: "", listeners: new Set() };
const emit = () => cloud.listeners.forEach((fn) => fn());

export const serverConfigured = () => Boolean(state.settings.serverUrl);

export async function browserCall(action, body = {}) {
  if (!serverConfigured()) throw new Error("The cloud browser is not connected. Add your Diji server in Settings → Cloud.");
  cloud.busy = true;
  cloud.error = "";
  emit();
  try {
    const res = await fetch(state.settings.serverUrl.replace(/\/+$/, "") + "/api/browser/" + action, {
      method: "POST",
      headers: serverHeaders(),
      body: JSON.stringify({ ...body, sessionId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Cloud browser answered ${res.status}.`);
    if (j.shot) cloud.last = { url: j.url, title: j.title, shot: j.shot };
    return j;
  } catch (e) {
    cloud.error = e.message === "Failed to fetch" ? "Could not reach your Diji server. Check the URL in Settings → Cloud." : e.message;
    throw new Error(cloud.error);
  } finally {
    cloud.busy = false;
    emit();
  }
}

export function renderBrowser(el, { openSettings }) {
  if (!serverConfigured()) {
    el.innerHTML = `<div class="panel-empty">${icon("globe", 28)}<p><strong>Connect the cloud browser</strong></p>
      <p>Diji drives a real Chromium on your free Oracle server to search, read docs and test what it builds.</p>
      <button type="button" class="btn-primary" data-open-cloud>${icon("cloud", 16)} Connect server</button></div>`;
    el.querySelector("[data-open-cloud]").onclick = () => openSettings("cloud");
    return;
  }
  if (!el.querySelector(".cb")) {
    el.innerHTML = `<div class="cb">
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
    img.onclick = (e) => {
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
