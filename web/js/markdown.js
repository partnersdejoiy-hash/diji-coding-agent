// Splits an agent reply into text, file, tool and error segments, and renders text as safe Markdown.
import { Marked } from "../vendor/marked.esm.js";

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const highlight = (code, lang) => {
  const hl = window.hljs;
  if (hl && lang && hl.getLanguage(lang)) {
    try {
      return hl.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {}
  }
  return esc(code);
};

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html: ({ text }) => esc(text), // raw HTML from a model is shown, never executed
    code({ text, lang }) {
      const l = (lang || "").split(/\s/)[0].toLowerCase();
      return `<div class="codeblock"><div class="codeblock-head"><span>${esc(l || "text")}</span><button class="copy-code" type="button" data-copy>Copy</button></div><pre><code class="hljs">${highlight(text, l)}</code></pre></div>`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const safe = /^(https?:|mailto:|#)/i.test(href || "") ? href : "#";
      return `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ""}>${text}</a>`;
    },
    image({ href, text }) {
      return /^https:/i.test(href || "") ? `<img src="${esc(href)}" alt="${esc(text || "")}" loading="lazy">` : esc(text || "");
    },
  },
});

export const renderMarkdown = (text) => marked.parse(text || "");

const ATTR = /(\w+)\s*=\s*"([^"]*)"/g;

export function parseAttrs(s) {
  const out = {};
  for (const m of s.matchAll(ATTR)) out[m[1]] = m[2];
  return out;
}

// Tool calls the model asked for, in order. Ignores anything inside code fences.
export function toolCalls(text) {
  return segments(text).filter((s) => s.type === "tool");
}

// Line scanner so fences, file blocks and tags never get confused with each other.
export function segments(text) {
  const out = [];
  // Reasoning from thinking models arrives as <think>…</think>; it is shown folded, never parsed for files.
  const t = text || "";
  const open = t.indexOf("<think>");
  if (open !== -1) {
    const close = t.indexOf("</think>", open);
    out.push({ type: "thinking", text: t.slice(open + 7, close === -1 ? undefined : close).trim(), done: close !== -1 });
    text = t.slice(0, open) + (close === -1 ? "" : t.slice(close + 8));
  }
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    const t = buf.join("\n");
    buf = [];
    let last = 0;
    for (const m of t.matchAll(/<diji-error>([\s\S]*?)<\/diji-error>|<diji-(browse|search|delete|remember)\b([^>]*?)\/?>(?:\s*<\/diji-\2>)?/g)) {
      if (m.index > last) out.push({ type: "text", text: t.slice(last, m.index) });
      if (m[1] !== undefined) out.push({ type: "error", text: m[1] });
      else out.push({ type: "tool", tool: m[2], args: parseAttrs(m[3]) });
      last = m.index + m[0].length;
    }
    if (last < t.length) out.push({ type: "text", text: t.slice(last) });
  };
  const lines = (text || "").split("\n");
  let fence = null; // { ticks, file?, lang, body: [] }
  for (const line of lines) {
    if (!fence) {
      const m = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*(.*)$/);
      if (m) {
        const info = m[3] || "";
        const file = (info.match(/(?:file|path|filename)\s*=\s*"?([^"\s]+)"?/) || [])[1];
        fence = { ticks: m[1], lang: m[2].toLowerCase(), file, body: [], open: line };
        if (!file) buf.push(line);
        else flush();
        continue;
      }
      buf.push(line);
      continue;
    }
    const closes = line.trim().startsWith(fence.ticks[0].repeat(fence.ticks.length)) && line.trim().replace(/[`~]/g, "") === "";
    if (closes) {
      if (fence.file) out.push({ type: "file", path: cleanPath(fence.file), lang: fence.lang, code: fence.body.join("\n"), done: true });
      else buf.push(line);
      fence = null;
      continue;
    }
    if (fence.file) fence.body.push(line);
    else buf.push(line);
  }
  if (fence?.file) out.push({ type: "file", path: cleanPath(fence.file), lang: fence.lang, code: fence.body.join("\n"), done: false });
  flush();
  return out.filter((s) => s.type !== "text" || s.text.trim());
}

export function cleanPath(p) {
  return p.replace(/\\/g, "/").replace(/^\.?\/+/, "").replace(/\.\.\//g, "").slice(0, 200);
}

export function langOf(path) {
  const ext = (path.split(".").pop() || "").toLowerCase();
  return (
    { js: "javascript", mjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", md: "markdown", yml: "yaml", sh: "bash", htm: "html", rs: "rust", rb: "ruby", kt: "kotlin", cs: "csharp" }[ext] || ext
  );
}
