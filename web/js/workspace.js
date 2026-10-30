// The workspace: files Diji wrote, a live preview, the code view, and a ZIP download.
import { esc, langOf, renderMarkdown } from "./markdown.js";
import { icon } from "./icons.js";

export function applyFiles(chat, segs) {
  const changed = [];
  for (const s of segs) {
    if (s.type === "file" && s.done && s.path) {
      if (chat.files[s.path] !== s.code) changed.push(s.path);
      chat.files[s.path] = s.code;
    }
    if (s.type === "tool" && s.tool === "delete" && s.args.path && chat.files[s.args.path] !== undefined) {
      delete chat.files[s.args.path];
      changed.push(s.args.path);
    }
  }
  return changed;
}

const pick = (files, re) => Object.keys(files).find((p) => re.test(p));

// Inlines local CSS/JS so a multi-file web app runs inside one sandboxed iframe.
export function buildPreview(files) {
  const htmlPath = files["index.html"] !== undefined ? "index.html" : pick(files, /\.html?$/i);
  if (!htmlPath) {
    const svg = pick(files, /\.svg$/i);
    if (svg) return `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${files[svg]}</body>`;
    const md = pick(files, /\.md$/i);
    if (md) return `<!doctype html><meta charset="utf-8"><body style="font:16px/1.65 system-ui;max-width:72ch;margin:40px auto;padding:0 20px;color:#221a1f">${renderMarkdown(files[md])}</body>`;
    return null;
  }
  const dir = htmlPath.includes("/") ? htmlPath.slice(0, htmlPath.lastIndexOf("/") + 1) : "";
  const find = (ref) => {
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith("data:")) return undefined;
    const clean = ref.split(/[?#]/)[0].replace(/^\.\//, "").replace(/^\//, "");
    return files[dir + clean] ?? files[clean];
  };
  const safeEnd = (s, tag) => s.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
  let html = files[htmlPath];
  html = html.replace(/<link\b[^>]*?href=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
    if (!/stylesheet/i.test(tag)) return tag;
    const css = find(href);
    return css === undefined ? tag : `<style data-from="${esc(href)}">\n${safeEnd(css, "style")}\n</style>`;
  });
  html = html.replace(/<script\b([^>]*?)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, pre, src, post) => {
    const js = find(src);
    if (js === undefined) return tag;
    const type = (pre + post).match(/type=["'][^"']+["']/i)?.[0] || "";
    return `<script ${type} data-from="${esc(src)}">\n${safeEnd(js, "script")}\n</script>`;
  });
  return html;
}

// Minimal ZIP writer (stored, no compression): good enough for source files, zero dependencies.
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = enc.encode(path);
    const data = enc.encode(content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, data.length, true);
    cen.setUint32(24, data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cenSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
}

export function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const highlight = (code, lang) => {
  const hl = window.hljs;
  if (hl && hl.getLanguage(lang)) {
    try {
      return hl.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {}
  }
  return esc(code);
};

export function renderPreview(el, chat) {
  const html = buildPreview(chat.files);
  if (!html) {
    el.innerHTML = `<div class="panel-empty">${icon("eye", 28)}<p><strong>Nothing to preview yet</strong></p><p>Ask Diji for a web page, a component or an SVG and it shows up here live.</p></div>`;
    return;
  }
  let frame = el.querySelector("iframe");
  if (!frame) {
    el.innerHTML = "";
    frame = document.createElement("iframe");
    frame.title = "Live preview";
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups");
    el.append(frame);
  }
  if (frame.dataset.src !== html) {
    frame.dataset.src = html;
    frame.srcdoc = html;
  }
}

export function renderCode(el, chat, selected, onSelect) {
  const paths = Object.keys(chat.files).sort();
  if (!paths.length) {
    el.innerHTML = `<div class="panel-empty">${icon("folder", 28)}<p><strong>No files yet</strong></p><p>Every file Diji writes lands here. Download them all as a ZIP when you are done.</p></div>`;
    return;
  }
  const current = paths.includes(selected) ? selected : paths[0];
  const code = chat.files[current];
  el.innerHTML = `<div class="code-view">
    <nav class="file-tree" aria-label="Files">${paths
      .map(
        (p) => `<button type="button" class="file-item${p === current ? " on" : ""}" data-path="${esc(p)}" title="${esc(p)}">${icon("file", 14)}<span>${esc(p)}</span></button>`,
      )
      .join("")}</nav>
    <div class="code-pane">
      <div class="code-pane-head"><span class="mono">${esc(current)}</span><span class="muted">${code.split("\n").length} lines</span>
        <button type="button" class="btn-ghost sm" data-copy-file>${icon("copy", 14)} Copy</button></div>
      <pre class="code-body"><code class="hljs">${highlight(code, langOf(current))}</code></pre>
    </div></div>`;
  el.querySelectorAll(".file-item").forEach((b) => (b.onclick = () => onSelect(b.dataset.path)));
  el.querySelector("[data-copy-file]").onclick = async (e) => {
    await navigator.clipboard.writeText(code).catch(() => {});
    e.currentTarget.innerHTML = `${icon("check", 14)} Copied`;
  };
}
