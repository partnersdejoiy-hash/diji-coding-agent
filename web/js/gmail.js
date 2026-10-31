// Gmail for Diji: search, read and draft emails with the user's own Google account.
// Uses Google Identity Services in the browser; the access token stays in memory and is never saved.
// Diji only creates drafts. Sending is always done by the person in Gmail.
import { state, save } from "./store.js";

const SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const auth = { token: "", expires: 0, email: "" };

export const gmailClientId = () => state.settings.googleClientId || window.DIJI_CONFIG?.googleClientId || "";
export const gmailConnected = () => Boolean(auth.token && Date.now() < auth.expires);
export const gmailEmail = () => auth.email;

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return (loadGis.p ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection."));
    document.head.append(s);
  }));
}

// Opens Google's consent popup. Must run from a click.
export async function connectGmail() {
  const clientId = gmailClientId();
  if (!clientId) throw new Error("Add your Google OAuth client ID first.");
  await loadGis();
  const res = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (r) => (r.error ? reject(new Error(r.error_description || r.error)) : resolve(r)),
      error_callback: (e) => reject(new Error(e.message || e.type || "Google sign-in was closed.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
  auth.token = res.access_token;
  auth.expires = Date.now() + (Number(res.expires_in) - 60) * 1000;
  const profile = await gapi("/profile");
  auth.email = profile.emailAddress || "";
  state.settings.gmailHint = auth.email;
  save();
  return auth.email;
}

export function disconnectGmail() {
  if (auth.token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(auth.token, () => {});
  auth.token = "";
  auth.expires = 0;
  auth.email = "";
}

async function gapi(path, init = {}) {
  if (!gmailConnected()) throw new Error("Gmail is not connected. Connect it in Settings → Gmail, then ask again.");
  const res = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json", ...(init.headers || {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `Gmail answered ${res.status}.`);
  return j;
}

const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
const b64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

function bodyText(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return b64(part.body.data);
  for (const p of part.parts || []) {
    const t = bodyText(p);
    if (t) return t;
  }
  if (part.mimeType === "text/html" && part.body?.data) return b64(part.body.data).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  return "";
}

export async function gmailSearch(query, max = 10) {
  const n = Math.min(Math.max(Number(max) || 10, 1), 20);
  const list = await gapi(`/messages?maxResults=${n}&q=${encodeURIComponent(query || "in:inbox")}`);
  const msgs = await Promise.all((list.messages || []).map((m) => gapi(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)));
  return msgs.map((m) => ({ id: m.id, from: header(m, "From"), subject: header(m, "Subject"), date: header(m, "Date"), snippet: m.snippet || "", unread: (m.labelIds || []).includes("UNREAD") }));
}

export async function gmailRead(id) {
  const m = await gapi(`/messages/${encodeURIComponent(id)}?format=full`);
  return { id: m.id, from: header(m, "From"), to: header(m, "To"), subject: header(m, "Subject"), date: header(m, "Date"), text: bodyText(m.payload).trim().slice(0, 8000) || m.snippet || "" };
}

const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`);

export async function gmailDraft({ to, subject, body, threadId }) {
  if (!to) throw new Error("A draft needs a recipient (to).");
  const raw = [`To: ${to}`, `Subject: ${encodeHeader(subject || "")}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", body || ""].join("\r\n");
  const encoded = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const d = await gapi("/drafts", { method: "POST", body: JSON.stringify({ message: { raw: encoded, ...(threadId ? { threadId } : {}) } }) });
  return { id: d.id, link: "https://mail.google.com/mail/u/0/#drafts" };
}

export function gmailSection() {
  if (!gmailConnected()) return "";
  return `\n\n## Gmail (connected as ${auth.email})
- Search mail: <diji-gmail-search query="is:unread newer_than:2d" max="10"/> (Gmail search syntax)
- Read one email: <diji-gmail-read id="MESSAGE_ID"/>
- Write a draft (never sent automatically; the user reviews and sends it in Gmail):
<diji-gmail-draft to="person@example.com" subject="Subject">Plain text body</diji-gmail-draft>
After a Gmail tag, stop and wait for the result. Summarise emails briefly; quote only what matters. Never invent email content.`;
}
