// Chat channels (OpenClaw-style): talk to Diji from Telegram, Slack and WhatsApp.
// Runs on the always-on Oracle server. Each channel starts only when its env vars are set.
// Only people on DIJI_CHANNEL_ALLOW (Telegram user ids, Slack user ids, WhatsApp numbers) get answers;
// everyone else is told their id so the owner can allow them. WhatsApp also answers in "Message yourself".
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { streamChat } from "../web/api/_lib/llm.js";

const env = (k) => process.env[k] || "";
const allow = () => new Set(env("DIJI_CHANNEL_ALLOW").split(",").map((s) => s.trim().replace(/^\+/, "")).filter(Boolean));
const HISTORY = 16;
const histories = new Map(); // "channel:chat" -> [{ role, content }]

const SYSTEM = `You are Diji, Dejoiy's friendly coding agent, chatting inside a messaging app.
Keep replies short and easy to read on a phone: a few short paragraphs or a small list, no tables.
Use code blocks only for short snippets. For bigger builds, outline the plan and tell the user to open https://diji-pi.vercel.app to build it with a live preview.
Reply in the user's language (Hinglish is fine).`;

export const status = { telegram: "off", slack: "off", whatsapp: "off", whatsappQr: "", log: [] };
function note(text) {
  status.log.unshift({ at: Date.now(), text });
  status.log.length = Math.min(status.log.length, 30);
}

// One reply from the free model, with a short per-chat memory. "/new" clears it.
export async function reply(key, text) {
  const t = String(text || "").trim().slice(0, 6000);
  if (/^\/(new|reset)\b/i.test(t)) {
    histories.delete(key);
    return "Fresh start. What are we building?";
  }
  if (/^\/(start|help)\b/i.test(t)) return "Hi, I'm Diji! Ask me to explain code, fix a bug or plan an app. Send /new to start over.";
  const h = histories.get(key) || [];
  h.push({ role: "user", content: t });
  let out = "";
  try {
    for await (const piece of streamChat({ provider: "diji-free", model: "openai", system: SYSTEM, messages: h, maxTokens: 1500 }, AbortSignal.timeout(90000))) out += piece;
  } catch (e) {
    h.pop();
    return `Sorry, I could not reach the model (${e.message}). Try again in a minute.`;
  }
  out = out.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/<diji-error>([\s\S]*?)<\/diji-error>/g, "($1)").trim() || "…";
  h.push({ role: "assistant", content: out });
  histories.set(key, h.slice(-HISTORY));
  return out;
}

const chunks = (text, size) => {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
};

/* ---------- Telegram (long polling, no public URL needed) ---------- */
async function telegram() {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) return;
  const api = `${env("TELEGRAM_API") || "https://api.telegram.org"}/bot${token}`;
  const call = async (method, body) => {
    const r = await fetch(`${api}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.description || `Telegram ${method} failed`);
    return j.result;
  };
  let offset = 0;
  status.telegram = "connecting";
  for (;;) {
    try {
      const updates = await call("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] });
      status.telegram = "on";
      for (const u of updates) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m?.text) continue;
        const from = String(m.from?.id || "");
        if (!allow().has(from)) {
          await call("sendMessage", { chat_id: m.chat.id, text: `Diji is private. Ask the owner to add your id ${from} to DIJI_CHANNEL_ALLOW.` });
          note(`Telegram: blocked ${from}`);
          continue;
        }
        call("sendChatAction", { chat_id: m.chat.id, action: "typing" }).catch(() => {});
        const text = await reply(`tg:${m.chat.id}`, m.text);
        for (const part of chunks(text, 4000)) await call("sendMessage", { chat_id: m.chat.id, text: part });
        note(`Telegram: answered ${from}`);
      }
    } catch (e) {
      status.telegram = `error: ${e.message}`;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/* ---------- Slack (Events API webhook at /api/channels/slack) ---------- */
function slackVerified(raw, headers) {
  const secret = env("SLACK_SIGNING_SECRET");
  const ts = headers["x-slack-request-timestamp"];
  const sig = headers["x-slack-signature"] || "";
  if (!secret || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mine = "v0=" + createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
  return mine.length === sig.length && timingSafeEqual(Buffer.from(mine), Buffer.from(sig));
}

const seenSlack = new Set();
// Returns { status, body } for the HTTP reply; the answer itself is posted afterwards.
export function slackEvent(raw, headers) {
  if (!env("SLACK_BOT_TOKEN")) return { status: 404, body: { error: "Slack is not set up on this server." } };
  if (!slackVerified(raw, headers)) return { status: 401, body: { error: "Bad Slack signature." } };
  const j = JSON.parse(raw || "{}");
  if (j.type === "url_verification") return { status: 200, body: { challenge: j.challenge } };
  const e = j.event || {};
  const isDm = e.type === "message" && e.channel_type === "im" && !e.subtype;
  if ((e.type === "app_mention" || isDm) && !e.bot_id && !seenSlack.has(j.event_id)) {
    seenSlack.add(j.event_id);
    if (seenSlack.size > 500) seenSlack.clear();
    answerSlack(e).catch((err) => note(`Slack: ${err.message}`));
  }
  return { status: 200, body: { ok: true } };
}

async function answerSlack(e) {
  const post = (text) =>
    fetch(`${env("SLACK_API") || "https://slack.com/api"}/chat.postMessage`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${env("SLACK_BOT_TOKEN")}` },
      body: JSON.stringify({ channel: e.channel, thread_ts: e.thread_ts || (e.channel_type === "im" ? undefined : e.ts), text }),
    });
  if (!allow().has(e.user)) {
    await post(`Diji is private. Ask the owner to add your Slack id ${e.user} to DIJI_CHANNEL_ALLOW.`);
    return note(`Slack: blocked ${e.user}`);
  }
  const text = await reply(`slack:${e.channel}:${e.thread_ts || e.ts}`, String(e.text || "").replace(/<@[A-Z0-9]+>/g, "").trim());
  await post(text);
  note(`Slack: answered ${e.user}`);
}

/* ---------- WhatsApp (WhatsApp Web, linked by QR like OpenClaw) ---------- */
// Unofficial: WhatsApp may restrict numbers that run bots. Use a spare number if you can.
async function whatsapp() {
  if (env("WHATSAPP_ENABLED") !== "1") return;
  let baileys, QR;
  try {
    baileys = await import("@whiskeysockets/baileys");
    QR = (await import("qrcode")).default;
  } catch {
    status.whatsapp = "error: packages missing (rebuild the Docker image)";
    return;
  }
  const makeSocket = baileys.default || baileys.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason } = baileys;
  const dir = env("WHATSAPP_AUTH_DIR") || "/data/whatsapp";
  await mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const silent = { level: "silent", trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return silent; } };
  const sock = makeSocket({ auth: state, logger: silent, printQRInTerminal: false, markOnlineOnConnect: false, browser: ["Diji", "Chrome", "1.0"] });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (u) => {
    if (u.qr) {
      status.whatsapp = "scan the QR code";
      status.whatsappQr = await QR.toDataURL(u.qr, { margin: 1, width: 300 });
    }
    if (u.connection === "open") {
      status.whatsapp = "on";
      status.whatsappQr = "";
      note("WhatsApp: linked");
    }
    if (u.connection === "close") {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      status.whatsapp = code === DisconnectReason.loggedOut ? "logged out (delete the auth folder and scan again)" : "reconnecting";
      if (code !== DisconnectReason.loggedOut) setTimeout(whatsapp, 3000);
    }
  });
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const me = (sock.user?.id || "").split(":")[0].split("@")[0];
    for (const m of messages) {
      const jid = m.key.remoteJid || "";
      if (!jid.endsWith("@s.whatsapp.net")) continue; // no groups or status updates
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text;
      if (!text || text.startsWith("Diji: ")) continue; // never answer our own replies
      const from = jid.split("@")[0];
      const selfChat = from === me;
      if (m.key.fromMe && !selfChat) continue; // you texting someone else: stay quiet
      if (!selfChat && !allow().has(from)) continue; // strangers get silence on WhatsApp
      await sock.sendPresenceUpdate("composing", jid).catch(() => {});
      const answer = await reply(`wa:${from}`, text);
      for (const part of chunks(answer, 3500)) await sock.sendMessage(jid, { text: `Diji: ${part}` });
      note(`WhatsApp: answered ${selfChat ? "you" : from}`);
    }
  });
}

export function startChannels() {
  telegram();
  whatsapp().catch((e) => (status.whatsapp = `error: ${e.message}`));
  if (env("SLACK_BOT_TOKEN")) status.slack = env("SLACK_SIGNING_SECRET") ? "on (waiting for events)" : "error: SLACK_SIGNING_SECRET missing";
}
