// Cloud browser: one headless Chromium shared by short-lived, isolated sessions (one context each).
import { chromium } from "playwright";
import { isPrivateHost } from "../web/api/_lib/llm.js";

const VIEW = { width: 1280, height: 800 };
const IDLE_MS = 10 * 60 * 1000;
const MAX_SESSIONS = Number(process.env.DIJI_MAX_BROWSERS || 4);
const sessions = new Map();
let browserPromise;

const getBrowser = () =>
  (browserPromise ??= chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }).catch((e) => {
    browserPromise = undefined;
    throw e;
  }));

export class BrowserError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function blocked(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "data:" || u.protocol === "about:" || u.protocol === "blob:") return false;
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    return isPrivateHost(u.hostname);
  } catch {
    return true;
  }
}

function normalizeUrl(input) {
  const s = String(input || "").trim();
  if (!s) throw new BrowserError(400, "Type a web address.");
  if (/^https?:\/\//i.test(s) || /^data:text\/html[,;]/i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s)) return "https://" + s;
  return "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(s);
}

async function getSession(id) {
  if (typeof id !== "string" || !/^[\w-]{6,64}$/.test(id)) throw new BrowserError(400, "Missing browser session id.");
  let s = sessions.get(id);
  if (s) {
    s.last = Date.now();
    return s;
  }
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].last - b[1].last)[0];
    await closeSession(oldest[0]);
  }
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: VIEW,
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 DijiCloudBrowser/1.0",
    acceptDownloads: false,
  });
  // Stop pages (and redirects) from reaching the server's own network or cloud metadata.
  await context.route("**/*", (route) => (blocked(route.request().url()) ? route.abort("blockedbyclient") : route.continue()));
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  s = { context, page, last: Date.now() };
  sessions.set(id, s);
  return s;
}

async function closeSession(id) {
  const s = sessions.get(id);
  sessions.delete(id);
  await s?.context.close().catch(() => {});
}

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.last > IDLE_MS) closeSession(id);
}, 60_000).unref();

async function snapshot(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
  const shot = await page.screenshot({ type: "jpeg", quality: 62 });
  return { url: page.url(), title: await page.title().catch(() => ""), shot: shot.toString("base64") };
}

async function readable(page) {
  return page.evaluate(() => {
    const clone = document.body ? document.body.cloneNode(true) : null;
    if (!clone) return { text: "", links: [] };
    clone.querySelectorAll("script,style,noscript,svg,iframe,nav,footer").forEach((n) => n.remove());
    const text = (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    const links = [...document.querySelectorAll("a[href]")]
      .map((a) => ({ text: (a.innerText || "").trim().slice(0, 80), href: a.href }))
      .filter((l) => l.text && /^https?:/.test(l.href))
      .slice(0, 40);
    return { text, links };
  });
}

// DuckDuckGo's HTML page wraps result links in a redirect; unwrap them so the model sees real URLs.
function unwrapDdg(href) {
  try {
    const u = new URL(href);
    return u.hostname.endsWith("duckduckgo.com") && u.searchParams.get("uddg") ? u.searchParams.get("uddg") : href;
  } catch {
    return href;
  }
}

export async function browserAction(action, body) {
  if (action === "close") {
    await closeSession(body.sessionId);
    return { closed: true };
  }
  const { page } = await getSession(body.sessionId);
  const go = async (url) => {
    if (blocked(url)) throw new BrowserError(400, "That address is private or not a web page, so the cloud browser will not open it.");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch((e) => {
      const code = (e.message.match(/net::(ERR_[A-Z_]+)/) || [])[1];
      const why = /TIMED_OUT|Timeout/i.test(e.message) ? "it took too long to load" : code === "ERR_NAME_NOT_RESOLVED" ? "that address does not exist" : code ? `the network said ${code}` : "it failed to load";
      throw new BrowserError(502, `Could not open ${new URL(url).hostname || "the page"}: ${why}.`);
    });
  };
  switch (action) {
    case "open":
      await go(normalizeUrl(body.url));
      break;
    case "search":
      await go("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(String(body.query || "").slice(0, 300)));
      break;
    case "click": {
      const x = Number(body.x), y = Number(body.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new BrowserError(400, "Click needs x and y.");
      await page.mouse.click(Math.min(Math.max(x, 0), VIEW.width), Math.min(Math.max(y, 0), VIEW.height));
      await page.waitForTimeout(700);
      break;
    }
    case "type":
      await page.keyboard.type(String(body.text || "").slice(0, 2000), { delay: 12 });
      break;
    case "key": {
      const key = String(body.key || "");
      if (!/^(Enter|Tab|Escape|Backspace|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|PageUp|PageDown|Home|End)$/.test(key))
        throw new BrowserError(400, "That key is not supported.");
      await page.keyboard.press(key);
      await page.waitForTimeout(500);
      break;
    }
    case "scroll":
      await page.mouse.wheel(0, Math.max(-4000, Math.min(4000, Number(body.dy) || 600)));
      await page.waitForTimeout(300);
      break;
    case "back":
      await page.goBack({ timeout: 15000 }).catch(() => {});
      break;
    case "forward":
      await page.goForward({ timeout: 15000 }).catch(() => {});
      break;
    case "reload":
      await page.reload({ timeout: 20000 }).catch(() => {});
      break;
    case "shot":
      break;
    case "read": {
      const r = await readable(page);
      return {
        ...(await snapshot(page)),
        text: r.text.slice(0, Number(body.max) || 12000),
        links: r.links.map((l) => ({ ...l, href: unwrapDdg(l.href) })),
      };
    }
    default:
      throw new BrowserError(404, `Unknown browser action "${action}".`);
  }
  return snapshot(page);
}

export async function shutdownBrowsers() {
  for (const id of [...sessions.keys()]) await closeSession(id);
  const b = await browserPromise?.catch(() => null);
  await b?.close();
}
