// Word, PowerPoint and Excel files. Diji writes them as plain text the model is good at
// (Markdown for .docx, Markdown slides for .pptx, CSV sections for .xlsx); this module previews
// them and builds the real file on download. Libraries load only when someone downloads.
import { Marked } from "../vendor/marked.esm.js";
import { esc } from "./markdown.js";

export const OFFICE = /\.(docx|pptx|xlsx)$/i;
export const isOffice = (path) => OFFICE.test(path || "");
const kindOf = (path) => (path.match(OFFICE)?.[1] || "").toLowerCase();
const md = new Marked({ gfm: true });

/* ---------- parsing ---------- */

// Slides are separated by a line with only ---. "# " is the title, "Notes:" starts speaker notes.
export function parseSlides(text) {
  return String(text || "")
    .split(/^\s*---\s*$/m)
    .map((block) => {
      const lines = block.split("\n");
      let title = "", subtitle = "", notes = [], bullets = [], body = [], inNotes = false;
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line.trim()) continue;
        if (/^notes?:/i.test(line.trim())) {
          inNotes = true;
          const rest = line.trim().replace(/^notes?:\s*/i, "");
          if (rest) notes.push(rest);
          continue;
        }
        if (inNotes) notes.push(line.trim());
        else if (/^#\s+/.test(line) && !title) title = line.replace(/^#\s+/, "");
        else if (/^##\s+/.test(line) && !subtitle) subtitle = line.replace(/^##\s+/, "");
        else if (/^\s*([-*+]|\d+\.)\s+/.test(line)) bullets.push({ text: line.replace(/^\s*([-*+]|\d+\.)\s+/, ""), level: Math.min(2, Math.floor(line.match(/^\s*/)[0].length / 2)) });
        else body.push(line.trim());
      }
      return { title, subtitle, bullets, body: body.join(" "), notes: notes.join("\n") };
    })
    .filter((s) => s.title || s.subtitle || s.bullets.length || s.body);
}

function csvRow(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") out.push(cur), (cur = "");
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// "## Sheet name" starts a sheet; other lines are CSV rows. Cells starting with = are formulas.
export function parseSheets(text) {
  const sheets = [];
  let cur = null;
  for (const line of String(text || "").split("\n")) {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      cur = { name: h[1].trim().replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Sheet${sheets.length + 1}`, rows: [] };
      sheets.push(cur);
      continue;
    }
    if (!line.trim()) continue;
    if (!cur) sheets.push((cur = { name: "Sheet1", rows: [] }));
    cur.rows.push(csvRow(line));
  }
  return sheets.length ? sheets : [{ name: "Sheet1", rows: [] }];
}

/* ---------- preview ---------- */

const PREVIEW_CSS = `body{margin:0;background:#efe9e0;font:15px/1.55 "Segoe UI",system-ui,sans-serif;color:#221a1f}
.doc{max-width:760px;margin:24px auto;background:#fff;padding:56px 64px;box-shadow:0 2px 10px rgba(0,0,0,.08);border-radius:4px}
.doc h1,.doc h2,.doc h3{font-family:Georgia,serif;line-height:1.25}.doc table{border-collapse:collapse;width:100%}.doc td,.doc th{border:1px solid #ccc;padding:6px 8px;text-align:left}
.deck{display:grid;gap:18px;max-width:880px;margin:24px auto;padding:0 16px}
.slide{aspect-ratio:16/9;background:#fff;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.08);padding:5% 6%;display:flex;flex-direction:column;position:relative;overflow:hidden;container-type:inline-size}
.slide:before{content:"";position:absolute;left:0;top:0;bottom:0;width:1.4%;background:#e8178a}
.slide h1{font:700 5.2cqw/1.1 Georgia,serif;margin:0 0 3%}.slide h2{font:400 3cqw/1.3 system-ui;color:#54484f;margin:0}
.slide ul{margin:0;padding-left:4%;font-size:2.6cqw;line-height:1.45}.slide p{font-size:2.6cqw;margin:0}.slide .n{position:absolute;right:3%;bottom:3%;font-size:1.6cqw;color:#999}
.slide.cover{justify-content:center;background:#221a1f;color:#fff}.slide.cover h2{color:#f9d2e4}
.sheet{margin:16px;overflow:auto}.sheet h3{font:600 14px system-ui;margin:12px 0 6px}.sheet table{border-collapse:collapse;background:#fff;font-size:13px}
.sheet td{border:1px solid #d9d9d9;padding:4px 8px;min-width:60px;white-space:nowrap}.sheet tr:first-child td{font-weight:700;background:#f6f2ec}.sheet td.num{text-align:right}.sheet td.f{color:#1d4bd1}`;

export function officePreview(path, text) {
  const k = kindOf(path);
  let body = "";
  if (k === "docx") body = `<article class="doc">${md.parse(text || "").replace(/<script/gi, "&lt;script")}</article>`;
  else if (k === "pptx") {
    const slides = parseSlides(text);
    body = `<div class="deck">${slides
      .map((s, i) => {
        const cover = i === 0 && !s.bullets.length;
        return `<section class="slide${cover ? " cover" : ""}">${s.title ? `<h1>${esc(s.title)}</h1>` : ""}${s.subtitle ? `<h2>${esc(s.subtitle)}</h2>` : ""}${s.body ? `<p>${esc(s.body)}</p>` : ""}${s.bullets.length ? `<ul>${s.bullets.map((b) => `<li style="margin-left:${b.level * 4}%">${esc(b.text)}</li>`).join("")}</ul>` : ""}<span class="n">${i + 1}</span></section>`;
      })
      .join("")}</div>`;
  } else if (k === "xlsx") {
    body = parseSheets(text)
      .map((s) => `<div class="sheet"><h3>${esc(s.name)}</h3><table>${s.rows
        .map((r) => `<tr>${r.map((c) => `<td class="${c.startsWith("=") ? "f" : isNum(c) ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`)
        .join("")}</table></div>`)
      .join("");
  }
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${PREVIEW_CSS}</style><body>${body}</body>`;
}

const isNum = (s) => /^-?\d+(\.\d+)?$/.test(String(s).replace(/,/g, "").trim()) && String(s).trim() !== "";

/* ---------- building real files ---------- */

const loaded = {};
function loadScript(src) {
  return (loaded[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load the file builder. Check your connection."));
    document.head.append(s);
  }));
}

const PINK = "E8178A";
const INK = "221A1F";

async function buildPptx(text, title) {
  await loadScript("/vendor/pptxgen.bundle.js");
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = title;
  const slides = parseSlides(text);
  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    const cover = i === 0 && !s.bullets.length;
    slide.background = { color: cover ? INK : "FFFFFF" };
    slide.addShape("rect", { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: PINK }, line: { color: PINK } });
    if (cover) {
      slide.addText(s.title || title, { x: 0.8, y: 2.3, w: 11.5, h: 1.5, fontFace: "Georgia", fontSize: 44, bold: true, color: "FFFFFF" });
      if (s.subtitle || s.body) slide.addText(s.subtitle || s.body, { x: 0.8, y: 3.9, w: 11.5, h: 1, fontSize: 22, color: "F9D2E4" });
    } else {
      if (s.title) slide.addText(s.title, { x: 0.6, y: 0.4, w: 12, h: 1, fontFace: "Georgia", fontSize: 32, bold: true, color: INK });
      let y = s.title ? 1.5 : 0.6;
      if (s.subtitle) slide.addText(s.subtitle, { x: 0.6, y, w: 12, h: 0.6, fontSize: 20, color: "54484F" }), (y += 0.7);
      if (s.body) slide.addText(s.body, { x: 0.6, y, w: 12, h: 0.9, fontSize: 18, color: INK, valign: "top" }), (y += 1);
      if (s.bullets.length) {
        slide.addText(
          s.bullets.map((b) => ({ text: b.text, options: { bullet: true, indentLevel: b.level, breakLine: true } })),
          { x: 0.6, y, w: 12, h: 7 - y, fontSize: 20, color: INK, valign: "top", paraSpaceAfter: 8 },
        );
      }
    }
    slide.addText(String(i + 1), { x: 12.4, y: 6.9, w: 0.6, h: 0.4, fontSize: 11, color: "999999", align: "right" });
    if (s.notes) slide.addNotes(s.notes);
  });
  return pptx.write({ outputType: "blob" });
}

async function buildDocx(text) {
  await loadScript("/vendor/docx.iife.js");
  const D = window.docx;
  const runs = (tokens = [], style = {}) =>
    tokens.flatMap((t) => {
      if (t.type === "strong") return runs(t.tokens, { ...style, bold: true });
      if (t.type === "em") return runs(t.tokens, { ...style, italics: true });
      if (t.type === "codespan") return [new D.TextRun({ text: t.text, font: "Consolas", ...style })];
      if (t.type === "link") return runs(t.tokens, { ...style, color: "1D4BD1", underline: {} });
      if (t.tokens) return runs(t.tokens, style);
      return [new D.TextRun({ text: (t.text || t.raw || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), ...style })];
    });
  const blocks = [];
  const walk = (tokens, level = 0, ordered = false) => {
    for (const t of tokens) {
      if (t.type === "heading") blocks.push(new D.Paragraph({ heading: D.HeadingLevel[`HEADING_${Math.min(t.depth, 6)}`], children: runs(t.tokens) }));
      else if (t.type === "paragraph") blocks.push(new D.Paragraph({ children: runs(t.tokens), spacing: { after: 160 } }));
      else if (t.type === "list")
        for (const item of t.items) {
          const [first, ...rest] = item.tokens;
          blocks.push(new D.Paragraph({ children: runs(first?.tokens || [{ text: item.text }]), ...(t.ordered ? { numbering: { reference: "num", level } } : { bullet: { level } }) }));
          for (const r of rest) if (r.type === "list") walk([r], level + 1, r.ordered);
        }
      else if (t.type === "code") t.text.split("\n").forEach((l) => blocks.push(new D.Paragraph({ children: [new D.TextRun({ text: l, font: "Consolas", size: 20 })] })));
      else if (t.type === "blockquote") walk(t.tokens, level);
      else if (t.type === "hr") blocks.push(new D.Paragraph({ thematicBreak: true }));
      else if (t.type === "table")
        blocks.push(new D.Table({
          width: { size: 100, type: D.WidthType.PERCENTAGE },
          rows: [t.header, ...t.rows].map((row, ri) => new D.TableRow({ children: row.map((c) => new D.TableCell({ children: [new D.Paragraph({ children: runs(c.tokens, ri === 0 ? { bold: true } : {}) })] })) })),
        }), new D.Paragraph({ text: "" }));
    }
  };
  walk(md.lexer(text || ""));
  const doc = new D.Document({
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: { config: [{ reference: "num", levels: [0, 1, 2].map((l) => ({ level: l, format: D.LevelFormat.DECIMAL, text: `%${l + 1}.`, alignment: D.AlignmentType.START, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })) }] },
    sections: [{ children: blocks }],
  });
  return D.Packer.toBlob(doc);
}

const xml = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
const col = (n) => {
  let s = "";
  for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// A small but valid .xlsx written by hand (JSZip comes with the PowerPoint bundle).
async function buildXlsx(text) {
  await loadScript("/vendor/pptxgen.bundle.js");
  const zip = new window.JSZip();
  const sheets = parseSheets(text);
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF9D2E4"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((s, si) => {
    const widths = [];
    s.rows.forEach((r) => r.forEach((c, ci) => (widths[ci] = Math.min(50, Math.max(widths[ci] || 8, c.length + 2)))));
    const rows = s.rows
      .map((r, ri) => `<row r="${ri + 1}">${r
        .map((c, ci) => {
          const ref = `${col(ci)}${ri + 1}`;
          const st = ri === 0 ? ' s="1"' : "";
          if (c.startsWith("=")) return `<c r="${ref}"${st}><f>${xml(c.slice(1))}</f></c>`;
          if (isNum(c)) return `<c r="${ref}"${st}><v>${Number(c.replace(/,/g, ""))}</v></c>`;
          return c === "" ? "" : `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xml(c)}</t></is></c>`;
        })
        .join("")}</row>`)
      .join("");
    const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    zip.file(`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${s.rows.length ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ""}${cols}<sheetData>${rows}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function buildOffice(path, text) {
  const k = kindOf(path);
  const title = path.split("/").pop().replace(OFFICE, "");
  if (k === "pptx") return buildPptx(text, title);
  if (k === "docx") return buildDocx(text);
  if (k === "xlsx") return buildXlsx(text);
  throw new Error("Not a Word, PowerPoint or Excel file.");
}

export const OFFICE_PROMPT = `

Word, PowerPoint and Excel files (the user downloads real .docx/.pptx/.xlsx files):
- Word: \`\`\`markdown file=report.docx\` with Markdown (headings, paragraphs, lists, tables, **bold**).
- PowerPoint: \`\`\`markdown file=deck.pptx\` with slides separated by a line containing only ---. Each slide: "# Title", optional "## Subtitle", then "- " bullets (indent 2 spaces for sub-points), optional "Notes: speaker notes". The first slide with no bullets is the cover. Keep 3 to 6 bullets per slide.
- Excel: \`\`\`csv file=budget.xlsx\` with CSV rows; start each sheet with "## Sheet name". The first row is the header. Cells starting with = are formulas, e.g. =SUM(B2:B9).
Only make these when the user asks for a document, deck or spreadsheet.`;
