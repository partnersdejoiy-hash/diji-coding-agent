// Toasts for the moment, a notification center for later, and system notifications when the tab is hidden.
import { state, save, uid } from "./store.js";
import { icon } from "./icons.js";

const listeners = new Set();
export const onNotificationsChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn());

const ICON = { success: "check", error: "alert", info: "info", agent: "sparkles" };

export function toast(message, type = "info", { title, action, keep = true, ms = 4200 } = {}) {
  const region = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `<span class="toast-ic">${icon(ICON[type] || "info", 16)}</span>
    <div class="toast-body">${title ? `<strong></strong>` : ""}<span></span></div>
    ${action ? `<button class="toast-act"></button>` : ""}
    <button class="toast-x" aria-label="Dismiss">${icon("x", 14)}</button>`;
  if (title) el.querySelector("strong").textContent = title;
  el.querySelector(".toast-body span").textContent = message;
  if (action) {
    const b = el.querySelector(".toast-act");
    b.textContent = action.label;
    b.onclick = () => {
      action.run();
      close();
    };
  }
  const close = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector(".toast-x").onclick = close;
  region.append(el);
  if (region.children.length > 4) region.firstElementChild.remove();
  setTimeout(close, type === "error" ? ms * 2 : ms);

  if (keep) {
    state.notifications.unshift({ id: uid(), type, title: title || "", message, at: Date.now(), read: false });
    state.notifications.length = Math.min(state.notifications.length, 50);
    save();
    emit();
  }
}

// System notification only when the person is looking elsewhere; otherwise the toast is enough.
export function systemNotify(title, body) {
  if (!state.settings.systemNotify || !document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.svg", tag: "diji" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {}
}

export async function askNotifyPermission() {
  if (!("Notification" in window)) {
    toast("This browser does not support system notifications.", "error", { keep: false });
    return false;
  }
  const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (p !== "granted") toast("Notifications are blocked for this site. Allow them in your browser's site settings.", "error", { keep: false });
  return p === "granted";
}

export function markAllRead() {
  state.notifications.forEach((n) => (n.read = true));
  save();
  emit();
}

export function clearNotifications() {
  state.notifications = [];
  save();
  emit();
}

export const unreadCount = () => state.notifications.filter((n) => !n.read).length;
