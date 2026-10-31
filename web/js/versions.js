// Checkpoints and diffs. Every change to the workspace (Diji's, a manual edit, an import, a restore)
// is recorded as a version you can diff against and restore, like Cline/bolt checkpoints.
import { uid, save } from "./store.js";

const MAX_VERSIONS = 25;

// Line diff via LCS. Returns [{t:" "|"+"|"-", s}] lines. Large files fall back to whole-file replace.
export function lineDiff(a = "", b = "") {
  const A = a === "" ? [] : a.split("\n");
  const B = b === "" ? [] : b.split("\n");
  if (A.length * B.length > 4_000_000) return [...A.map((s) => ({ t: "-", s })), ...B.map((s) => ({ t: "+", s }))];
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length, endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) endA--, endB--;
  const a2 = A.slice(start, endA), b2 = B.slice(start, endB);
  const n = a2.length, m = b2.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const mid = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a2[i] === b2[j]) mid.push({ t: " ", s: a2[i++] }), j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) mid.push({ t: "-", s: a2[i++] });
    else mid.push({ t: "+", s: b2[j++] });
  }
  while (i < n) mid.push({ t: "-", s: a2[i++] });
  while (j < m) mid.push({ t: "+", s: b2[j++] });
  return [...A.slice(0, start).map((s) => ({ t: " ", s })), ...mid, ...A.slice(endA).map((s) => ({ t: " ", s }))];
}

export function diffStats(a, b) {
  let added = 0, removed = 0;
  for (const l of lineDiff(a, b)) l.t === "+" ? added++ : l.t === "-" && removed++;
  return { added, removed };
}

// changes: { path: newContent | null (delete) }. Applies them, skipping locked files, and records a version.
export function commitChanges(chat, changes, label, msgId) {
  chat.versions ||= [];
  chat.locked ||= [];
  if (!chat.versions.length && Object.keys(chat.files).length) {
    chat.versions.push({ id: uid(), at: Date.now(), label: "Starting point", files: { ...chat.files } });
  }
  const summary = [];
  const skipped = [];
  for (const [path, code] of Object.entries(changes)) {
    if (chat.locked.includes(path)) {
      skipped.push(path);
      continue;
    }
    const before = chat.files[path];
    if (code === null) {
      if (before === undefined) continue;
      delete chat.files[path];
      summary.push({ path, status: "deleted", added: 0, removed: before.split("\n").length });
    } else {
      if (before === code) continue;
      chat.files[path] = code;
      summary.push({ path, status: before === undefined ? "added" : "modified", ...diffStats(before ?? "", code) });
    }
  }
  if (summary.length) {
    chat.versions.push({ id: uid(), at: Date.now(), label: label.slice(0, 80), msgId, files: { ...chat.files }, summary });
    if (chat.versions.length > MAX_VERSIONS) chat.versions.splice(1, chat.versions.length - MAX_VERSIONS);
    save();
  }
  return { summary, skipped };
}

export function restoreVersion(chat, id) {
  const v = chat.versions?.find((x) => x.id === id);
  if (!v) return false;
  const changes = {};
  for (const p of Object.keys(chat.files)) if (!(p in v.files)) changes[p] = null;
  for (const [p, c] of Object.entries(v.files)) changes[p] = c;
  const wasLocked = chat.locked;
  chat.locked = []; // a restore is an explicit choice, so it may touch locked files too
  commitChanges(chat, changes, `Restored “${v.label}”`);
  chat.locked = wasLocked;
  return true;
}

// The version of a file just before the latest change to it, for the "Changes" view.
export function previousContent(chat, path) {
  const vs = chat.versions || [];
  for (let i = vs.length - 1; i >= 0; i--) {
    if (vs[i].files[path] !== chat.files[path]) return vs[i].files[path] ?? "";
  }
  return ""; // unchanged since it was created: show the whole file as added
}
