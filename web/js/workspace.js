// The workspace: files Diji wrote, a live preview, the code view, and a ZIP download.
import { esc, langOf, renderMarkdown } from "./markdown.js";
import { icon } from "./icons.js";
import { lineDiff, previousContent } from "./versions.js";

// What a reply wants to change: { path: content | null for delete }. Applying is versions.commitChanges.
export function fileChanges(segs) {
  const changes = {};
  for (const s of segs) {
    if (s.type === "file" && s.done && s.path) changes[s.path] = s.code;
    if (s.type === "tool" && s.tool === "delete" && s.args.path) changes[s.args.path] = null;
  }
  return changes;
}

// Injected into every preview: reports runtime errors and supports click-to-select (Dyad-style).
const RUNTIME = `<script>(()=>{const send=m=>parent.postMessage(Object.assign({diji:1},m),"*");
addEventListener("error",e=>{const t=e.target;if(t&&t!==window&&(t.src||t.href)){send({kind:"error",message:"Failed to load "+(t.src||t.href)});return}send({kind:"error",message:String(e.message||e.error),line:e.lineno})},true);
addEventListener("unhandledrejection",e=>send({kind:"error",message:"Unhandled promise rejection: "+String(e.reason&&e.reason.message||e.reason)}));
const ce=console.error;console.error=(...a)=>{send({kind:"error",message:a.map(x=>x instanceof Error?x.message:typeof x==="object"?(()=>{try{return JSON.stringify(x)}catch{return String(x)}})():String(x)).join(" ").slice(0,500)});ce.apply(console,a)};
let picking=false,box=null;const clear=()=>{picking=false;box&&box.remove();box=null;document.documentElement.style.cursor=""};
addEventListener("message",e=>{if(e.data&&typeof e.data.dijiPick==="boolean"){if(e.data.dijiPick){picking=true;document.documentElement.style.cursor="crosshair"}else clear()}});
const sel=el=>{const p=[];while(el&&el.nodeType===1&&p.length<4&&el!==document.body){let s=el.tagName.toLowerCase();if(el.id){p.unshift(s+"#"+el.id);break}const c=[...el.classList].slice(0,2).join(".");if(c)s+="."+c;p.unshift(s);el=el.parentElement}return p.join(" > ")};
addEventListener("mouseover",e=>{if(!picking)return;const r=e.target.getBoundingClientRect();if(!box){box=document.createElement("div");box.style.cssText="position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #e8178a;background:rgba(232,23,138,.08);border-radius:4px;transition:all .08s";document.documentElement.appendChild(box)}Object.assign(box.style,{left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"})},true);
addEventListener("click",e=>{if(!picking)return;e.preventDefault();e.stopPropagation();const el=e.target;send({kind:"picked",selector:sel(el),html:el.outerHTML.slice(0,800),text:(el.innerText||"").trim().slice(0,120)});clear()},true);
addEventListener("keydown",e=>{if(picking&&e.key==="Escape"){clear();send({kind:"pickcancel"})}});
})();<\/script>`;

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
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => h + RUNTIME) : RUNTIME + html;
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

export function renderPreview(el, chat, ui, handlers) {
  const html = buildPreview(chat.files);
  if (!html) {
    el.innerHTML = `<div class="panel-empty">${icon("eye", 28)}<p><strong>Nothing to preview yet</strong></p><p>Ask Diji for a web page, a component or an SVG and it shows up here live.</p></div>`;
    return;
  }
  if (!el.querySelector(".pv")) {
    el.innerHTML = `<div class="pv">
      <div class="pv-bar">
        <button type="button" class="btn-ghost sm" data-pick aria-pressed="false">${icon("pointer", 14)} Select element</button>
        <button type="button" class="btn-ghost sm" data-reload>${icon("rotate", 14)} Reload</button>
        <span class="spacer"></span>
        <button type="button" class="problems" data-problems hidden></button>
      </div>
      <div class="pv-frame"><iframe title="Live preview" sandbox="allow-scripts allow-forms allow-modals allow-popups"></iframe></div>
    </div>`;
    el.querySelector("[data-pick]").onclick = handlers.onPick;
    el.querySelector("[data-reload]").onclick = () => {
      const f = el.querySelector("iframe");
      handlers.onReload();
      f.srcdoc = f.dataset.src;
    };
    el.querySelector("[data-problems]").onclick = handlers.onFix;
  }
  const frame = el.querySelector("iframe");
  if (frame.dataset.src !== html) {
    handlers.onReload();
    frame.dataset.src = html;
    frame.srcdoc = html;
  }
  const pickBtn = el.querySelector("[data-pick]");
  pickBtn.setAttribute("aria-pressed", String(Boolean(ui.picking)));
  pickBtn.innerHTML = `${icon("pointer", 14)} ${ui.picking ? "Click an element… (Esc)" : "Select element"}`;
  const pb = el.querySelector("[data-problems]");
  const n = ui.problems.length;
  pb.hidden = !n;
  pb.innerHTML = `${icon("alert", 14)} ${n} problem${n === 1 ? "" : "s"} · <strong>Fix with Diji</strong>`;
  pb.title = ui.problems.map((p) => p.message).join("\n");
}

export const previewFrame = (el) => el.querySelector(".pv-frame iframe");

function diffHtml(oldText, newText) {
  const rows = lineDiff(oldText, newText);
  if (!rows.some((r) => r.t !== " ")) return `<p class="muted pad">No changes in this file since the previous version.</p>`;
  // Show changed lines with 3 lines of context, collapsing long unchanged runs.
  const keep = new Set();
  rows.forEach((r, i) => {
    if (r.t !== " ") for (let k = Math.max(0, i - 3); k <= Math.min(rows.length - 1, i + 3); k++) keep.add(k);
  });
  let out = "";
  let gap = false;
  rows.forEach((r, i) => {
    if (!keep.has(i)) {
      if (!gap) out += `<div class="dl gap">⋯</div>`;
      gap = true;
      return;
    }
    gap = false;
    out += `<div class="dl ${r.t === "+" ? "add" : r.t === "-" ? "del" : ""}"><span class="dm">${r.t === " " ? "" : r.t}</span>${esc(r.s) || " "}</div>`;
  });
  return `<div class="diff">${out}</div>`;
}

export function renderCode(el, chat, view, h) {
  const all = Object.keys(chat.files).sort();
  if (!all.length) {
    el.innerHTML = `<div class="panel-empty">${icon("folder", 28)}<p><strong>No files yet</strong></p><p>Every file Diji writes lands here. You can also bring in a project.</p>
      <div class="btn-row center"><button type="button" class="btn-ghost" data-import>${icon("github", 16)} Import from GitHub</button></div></div>`;
    el.querySelector("[data-import]").onclick = h.onImport;
    return;
  }
  const q = (view.query || "").toLowerCase();
  const hits = (p) => !q || p.toLowerCase().includes(q) || chat.files[p].toLowerCase().includes(q);
  const paths = all.filter(hits);
  const current = all.includes(view.selected) ? view.selected : paths[0] || all[0];
  const code = chat.files[current];
  const locked = (chat.locked || []).includes(current);
  const mode = view.mode || "code";
  const scroll = el.querySelector(".code-body")?.scrollTop || 0;
  el.innerHTML = `<div class="code-view">
    <div class="file-side">
      <label class="file-search">${icon("search", 14)}<input type="search" placeholder="Search files and code" value="${esc(view.query || "")}" aria-label="Search files and code"></label>
      <nav class="file-tree" aria-label="Files">${paths
        .map((p) => {
          const lk = (chat.locked || []).includes(p);
          return `<button type="button" class="file-item${p === current ? " on" : ""}" data-path="${esc(p)}" title="${esc(p)}">${icon(lk ? "lock" : "file", 14)}<span>${esc(p)}</span></button>`;
        })
        .join("") || `<p class="muted pad">No match for “${esc(view.query)}”.</p>`}</nav>
      <div class="file-side-foot">
        <button type="button" class="btn-ghost sm" data-import>${icon("github", 14)} Import</button>
        <button type="button" class="btn-ghost sm" data-stackblitz title="Run the full project, npm included, on StackBlitz">${icon("zap", 14)} StackBlitz</button>
        <button type="button" class="btn-ghost sm phone-only" data-zip>${icon("download", 14)} ZIP</button>
      </div>
    </div>
    <div class="code-pane">
      <div class="code-pane-head">
        <span class="mono path">${esc(current)}</span>
        <div class="seg sm" role="tablist" aria-label="File view">
          ${["code", "changes", "edit"].map((m) => `<label><input type="radio" name="cv" value="${m}"${m === mode ? " checked" : ""}><span>${{ code: "Code", changes: "Changes", edit: "Edit" }[m]}</span></label>`).join("")}
        </div>
        <span class="spacer"></span>
        <button type="button" class="icon-btn tiny" data-lock aria-pressed="${locked}" title="${locked ? "Unlock: let Diji change this file" : "Lock: Diji will not change this file"}" aria-label="${locked ? "Unlock file" : "Lock file"}">${icon(locked ? "lock" : "unlock", 15)}</button>
        <button type="button" class="icon-btn tiny" data-copy-file title="Copy file" aria-label="Copy file">${icon("copy", 15)}</button>
      </div>
      ${mode === "edit"
        ? `<textarea class="code-edit" spellcheck="false" aria-label="Edit ${esc(current)}">${esc(code)}</textarea>
           <div class="edit-bar"><span class="muted sm">Saving creates a checkpoint you can undo.</span><span class="spacer"></span>
           <button type="button" class="btn-ghost sm" data-cancel-edit>Cancel</button><button type="button" class="btn-primary sm" data-save-edit>${icon("check", 14)} Save</button></div>`
        : mode === "changes"
          ? `<div class="code-body">${diffHtml(previousContent(chat, current), code)}</div>`
          : `<pre class="code-body"><code class="hljs">${highlight(code, langOf(current))}</code></pre>`}
    </div></div>`;
  const body = el.querySelector(".code-body");
  if (body) body.scrollTop = scroll;
  const search = el.querySelector(".file-search input");
  search.oninput = () => h.onQuery(search.value);
  if (view.focusSearch) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
  el.querySelectorAll(".file-item").forEach((b) => (b.onclick = () => h.onSelect(b.dataset.path)));
  el.querySelectorAll("input[name=cv]").forEach((r) => (r.onchange = () => h.onMode(r.value)));
  el.querySelector("[data-lock]").onclick = () => h.onLock(current);
  el.querySelector("[data-import]").onclick = h.onImport;
  el.querySelector("[data-stackblitz]").onclick = h.onStackBlitz;
  el.querySelector("[data-zip]").onclick = h.onZip;
  el.querySelector("[data-copy-file]").onclick = async (e) => {
    await navigator.clipboard.writeText(code).catch(() => {});
    e.currentTarget.innerHTML = icon("check", 15);
  };
  const ta = el.querySelector(".code-edit");
  if (ta) {
    ta.focus();
    ta.onkeydown = (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        h.onSave(current, ta.value);
      }
    };
    el.querySelector("[data-save-edit]").onclick = () => h.onSave(current, ta.value);
    el.querySelector("[data-cancel-edit]").onclick = () => h.onMode("code");
  }
}

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(ts).toLocaleDateString();
}

export function renderHistory(el, chat, h) {
  const vs = [...(chat.versions || [])].reverse();
  if (!vs.length) {
    el.innerHTML = `<div class="panel-empty">${icon("history", 28)}<p><strong>No checkpoints yet</strong></p><p>Every time Diji changes your files, a checkpoint lands here so you can compare and roll back.</p></div>`;
    return;
  }
  el.innerHTML = `<div class="history"><ol class="versions">${vs
    .map((v, i) => {
      const add = (v.summary || []).reduce((n, x) => n + x.added, 0);
      const del = (v.summary || []).reduce((n, x) => n + x.removed, 0);
      return `<li class="version${i === 0 ? " current" : ""}">
        <div class="v-head"><strong>${esc(v.label)}</strong><time>${ago(v.at)}</time></div>
        ${v.summary?.length ? `<ul class="v-files">${v.summary.map((f) => `<li><span class="v-st ${f.status}">${f.status === "added" ? "A" : f.status === "deleted" ? "D" : "M"}</span><span class="mono">${esc(f.path)}</span><span class="stat"><span class="plus">+${f.added}</span> <span class="minus">−${f.removed}</span></span></li>`).join("")}</ul>` : `<p class="muted sm">${Object.keys(v.files).length} files</p>`}
        <div class="v-foot">${i === 0 ? `<span class="badge-now">Current</span>` : `<button type="button" class="btn-ghost sm" data-restore="${v.id}">${icon("rotate", 13)} Restore this version</button>`}
        ${v.summary?.length ? `<span class="muted sm">+${add} −${del}</span>` : ""}</div>
      </li>`;
    })
    .join("")}</ol></div>`;
  el.querySelectorAll("[data-restore]").forEach((b) => (b.onclick = () => h.onRestore(b.dataset.restore)));
}

// Opens the project on StackBlitz, which runs full Node/npm projects in the browser for free.
export function openInStackBlitz(files, title) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "https://stackblitz.com/run";
  form.target = "_blank";
  const add = (name, value) => {
    const i = document.createElement("input");
    i.type = "hidden";
    i.name = name;
    i.value = value;
    form.append(i);
  };
  add("project[title]", title || "Built with Diji");
  add("project[description]", "Built with Diji, the joyful coding agent by Dejoiy");
  add("project[template]", files["package.json"] ? "node" : "html");
  for (const [p, c] of Object.entries(files)) add(`project[files][${p}]`, c);
  document.body.append(form);
  form.submit();
  form.remove();
}

// Brings a public GitHub repo into the workspace (text files only, size-capped).
export async function importFromGitHub(input, token) {
  const m = String(input).trim().match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.*))?)?\/?$/);
  if (!m) throw new Error("Use a GitHub link like github.com/owner/repo.");
  const [, owner, repo, refIn, sub] = m;
  const headers = { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const gh = async (path) => {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (!res.ok) throw new Error(res.status === 404 ? "Repository not found, or it is private (add a GitHub token in Settings to import private repos)." : res.status === 403 ? "GitHub rate limit reached. Add a GitHub token in Settings → GitHub & Vercel." : `GitHub answered ${res.status}.`);
    return res.json();
  };
  const ref = refIn || (await gh(`/repos/${owner}/${repo}`)).default_branch;
  const tree = await gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const TEXT = /\.(html?|css|scss|js|mjs|cjs|jsx|ts|tsx|json|md|txt|svg|py|java|c|cpp|h|go|rs|rb|php|vue|svelte|astro|yml|yaml|toml|sh|sql|xml|env\.example|gitignore)$|(^|\/)(Dockerfile|Makefile|LICENSE|README)$/i;
  const SKIP = /(^|\/)(node_modules|dist|build|\.next|\.git|vendor|coverage)\//;
  const prefix = sub ? sub.replace(/\/$/, "") + "/" : "";
  const wanted = tree.tree.filter((t) => t.type === "blob" && t.path.startsWith(prefix) && TEXT.test(t.path) && !SKIP.test(t.path) && t.size < 200_000 && !/lock\.json$|\.lock$/.test(t.path));
  if (!wanted.length) throw new Error("No text files found to import.");
  const files = {};
  let total = 0;
  for (const t of wanted.slice(0, 150)) {
    if (total + t.size > 1_500_000) break;
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/${t.path.split("/").map(encodeURIComponent).join("/")}`);
    if (!res.ok) continue;
    files[t.path.slice(prefix.length)] = await res.text();
    total += t.size;
  }
  return { files, name: `${owner}/${repo}`, skipped: wanted.length - Object.keys(files).length };
}
