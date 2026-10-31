// Skills: Markdown playbooks in the open Agent Skills format (SKILL.md with name/description frontmatter).
// Built-ins ship in /skills; people can import any SKILL.md by URL or paste. Diji auto-picks the ones a task needs.
import { state, save, uid } from "./store.js";

let builtins = [];
const cache = new Map();

export async function loadSkills() {
  try {
    builtins = (await (await fetch("/skills/index.json")).json()).skills;
  } catch {
    builtins = [];
  }
  return allSkills();
}

// Resolves once the built-in skills are loaded (a message sent right after page load still gets them).
let loading = null;
export const skillsReady = () => (builtins.length ? Promise.resolve() : (loading ||= loadSkills()));

export const allSkills = () => [...builtins.map((s) => ({ ...s, builtin: true })), ...state.settings.customSkills];

export async function skillContent(skill) {
  if (skill.content) return skill.content;
  if (cache.has(skill.id)) return cache.get(skill.id);
  const text = await (await fetch(`/skills/${skill.id}.md`)).text();
  const body = parseSkill(text).body;
  cache.set(skill.id, body);
  return body;
}

export function parseSkill(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const meta = {};
  if (m) for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { meta, body: (m ? m[2] : text).trim() };
}

// Keyword scoring: tags count double, words in the description once. Cheap and predictable.
export function autoPick(prompt, max = 3) {
  const words = new Set((prompt.toLowerCase().match(/[a-z0-9+#.]{2,}/g) || []).map((w) => w.replace(/s$/, "")));
  const scored = allSkills()
    .map((s) => {
      let score = 0;
      for (const t of s.tags || []) if (t.split(/\s+/).every((p) => words.has(p.toLowerCase().replace(/s$/, "")))) score += 2;
      for (const w of (s.description || "").toLowerCase().match(/[a-z0-9+#]{4,}/g) || []) if (words.has(w.replace(/s$/, ""))) score += 0.35;
      return { s, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.s);
}

export function activeSkills(prompt) {
  const pinned = allSkills().filter((s) => state.settings.skills.includes(s.id));
  const auto = state.settings.autoSkills ? autoPick(prompt).filter((s) => !pinned.includes(s)) : [];
  return [...pinned, ...auto].slice(0, 6);
}

export function togglePinned(id) {
  const list = state.settings.skills;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  save();
}

const toRaw = (url) =>
  url
    .replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, "https://raw.githubusercontent.com/$1/$2/")
    .replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+?)\/?$/, "https://raw.githubusercontent.com/$1/$2/$3/$4/SKILL.md");

export async function importSkill({ url, text }) {
  let source = text;
  if (url) {
    const raw = toRaw(url.trim());
    if (!/^https:\/\//.test(raw)) throw new Error("Use an https link to a SKILL.md file.");
    const res = await fetch(raw);
    if (!res.ok) throw new Error(`Could not download the skill (${res.status}). Use the raw file link.`);
    source = await res.text();
  }
  if (!source || source.length < 20) throw new Error("That skill is empty.");
  if (source.length > 60000) throw new Error("That skill is over 60 KB. Trim it so it fits in a prompt.");
  const { meta, body } = parseSkill(source);
  const name = meta.name || (body.match(/^#\s+(.+)$/m) || [])[1] || "Imported skill";
  const skill = {
    id: "custom-" + uid(),
    name: name.slice(0, 60),
    description: (meta.description || body.split("\n").find((l) => l.trim() && !l.startsWith("#")) || "").slice(0, 300),
    tags: (meta.tags || name).toLowerCase().split(/[,\s]+/).filter(Boolean).slice(0, 8),
    content: body,
  };
  state.settings.customSkills.push(skill);
  state.settings.skills.push(skill.id);
  save();
  return skill;
}

export function removeSkill(id) {
  state.settings.customSkills = state.settings.customSkills.filter((s) => s.id !== id);
  state.settings.skills = state.settings.skills.filter((s) => s !== id);
  save();
}
