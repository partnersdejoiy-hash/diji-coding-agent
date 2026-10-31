// App state, persisted to this browser only. API keys never leave the device except inside the
// request to the provider they belong to.
import { DEFAULT_MODEL } from "../shared/catalog.js";

const KEY = "diji:v1";
const KEYS_SESSION = "diji:keys";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const defaults = () => ({
  chats: [],
  projects: [], // { id, name, instructions, files: { name: text }, created }
  activeId: null,
  settings: {
    model: { ...DEFAULT_MODEL },
    providers: {}, // id -> { key, baseUrl, kind, models: [] }
    rememberKeys: true,
    serverUrl: (window.DIJI_CONFIG && window.DIJI_CONFIG.serverUrl) || "",
    serverToken: "",
    chatVia: "site", // "site" = this deployment's /api, "server" = the Oracle Diji server
    theme: "system",
    enterToSend: true,
    systemNotify: false,
    temperature: 0.4,
    autoSkills: true,
    mode: "build", // build | plan | ask | research
    effort: "medium", // low | medium | high
    style: "normal", // normal | concise | explanatory | formal
    userName: "",
    memoryOn: true,
    memory: [], // { id, text, at } facts Diji remembers across chats
    voiceLang: "",
    autoApply: true, // false = review every change before it touches files
    rules: "", // project rules sent with every request
    skills: [], // manually pinned skill ids
    customSkills: [], // { id, name, description, tags, content }
    sidebarOpen: true,
  },
  notifications: [],
});

function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) {
      base.chats = Array.isArray(saved.chats) ? saved.chats : [];
      base.projects = Array.isArray(saved.projects) ? saved.projects : [];
      base.activeId = saved.activeId || null;
      base.settings = { ...base.settings, ...saved.settings };
      // A deployment default fills in an empty saved server URL (people who never set one).
      if (!base.settings.serverUrl && window.DIJI_CONFIG?.serverUrl) base.settings.serverUrl = window.DIJI_CONFIG.serverUrl;
      // An earlier default saved the shared server's URL without a token; that now means "built-in".
      if (base.settings.serverUrl === "https://130-210-33-30.sslip.io" && !base.settings.serverToken) base.settings.serverUrl = "";
      base.notifications = Array.isArray(saved.notifications) ? saved.notifications.slice(0, 50) : [];
    }
    if (!base.settings.rememberKeys) {
      const keys = JSON.parse(sessionStorage.getItem(KEYS_SESSION) || "{}");
      for (const [id, key] of Object.entries(keys)) (base.settings.providers[id] ||= {}).key = key;
    }
  } catch {
    // Corrupt or blocked storage: start fresh rather than crash.
  }
  return base;
}

export const state = load();

let saveTimer;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const s = structuredClone(state.settings);
      if (!s.rememberKeys) {
        const keys = {};
        for (const [id, p] of Object.entries(s.providers)) if (p.key) (keys[id] = p.key), delete p.key;
        sessionStorage.setItem(KEYS_SESSION, JSON.stringify(keys));
      }
      // Incognito chats are never written to storage.
      const chats = state.chats.filter((c) => !c.incognito);
      localStorage.setItem(KEY, JSON.stringify({ chats, projects: state.projects, activeId: state.activeId, settings: s, notifications: state.notifications }));
    } catch (e) {
      // Quota exceeded: drop the oldest chats' tool output and retry once.
      if (state.chats.length > 1 && !save.retried) {
        save.retried = true;
        for (const c of state.chats.slice(Math.ceil(state.chats.length / 2))) {
          c.messages = c.messages.filter((m) => m.role !== "tool");
          c.messages.forEach((m) => delete m.images);
          if (c.versions) c.versions = c.versions.slice(-3);
        }
        save();
      }
    }
  }, 250);
}

export const activeChat = () => state.chats.find((c) => c.id === state.activeId) || null;

export function newChat(extra = {}) {
  // Leaving an incognito chat forgets it.
  state.chats = state.chats.filter((c) => !c.incognito);
  const chat = { id: uid(), title: "New chat", messages: [], files: {}, created: Date.now(), updated: Date.now(), ...extra };
  state.chats.unshift(chat);
  state.activeId = chat.id;
  save();
  return chat;
}

export function deleteChat(id) {
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.activeId === id) state.activeId = state.chats[0]?.id || null;
  save();
}

export const providerSettings = (id) => (state.settings.providers[id] ||= {});

export function apiBase() {
  const s = state.settings;
  return s.chatVia === "server" && s.serverUrl ? s.serverUrl.replace(/\/+$/, "") : "";
}

export function serverHeaders() {
  const h = { "content-type": "application/json" };
  if (state.settings.serverToken) h["x-diji-token"] = state.settings.serverToken;
  return h;
}

export const projectOf = (chat) => (chat?.projectId ? state.projects.find((p) => p.id === chat.projectId) : null);
