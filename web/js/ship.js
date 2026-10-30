// Ship the workspace: push it to the person's own GitHub, or deploy it to their own Vercel.
// Tokens live with the API keys (same "remember keys" rule). GitHub is called straight from the
// browser (its API allows it); Vercel goes through Diji's stateless /api/deploy proxy.
import { providerSettings, apiBase, serverHeaders } from "./store.js";

const GH = "https://api.github.com";

export const githubToken = () => providerSettings("github").key || "";
export const vercelToken = () => providerSettings("vercel").key || "";

export function slug(s, fallback = "diji-project") {
  const out = String(s || "").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60);
  return out || fallback;
}

async function gh(path, token, init = {}) {
  const res = await fetch(GH + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(init.body ? { "content-type": "application/json" } : {}) },
  });
  if (res.status === 404 && init.allow404) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint =
      res.status === 401 ? "Your GitHub token is invalid or expired. Make a new one in Settings → Deploy." :
      res.status === 403 || res.status === 404 ? "Your GitHub token cannot do this. It needs repository Contents and Administration write access (or the classic \"repo\" scope)." :
      res.status === 422 ? j.errors?.[0]?.message || j.message || "GitHub rejected that repository name." : j.message || `GitHub answered ${res.status}.`;
    throw new Error(hint);
  }
  return j;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Creates the repo if needed, then writes every workspace file in one commit on the default branch.
export async function pushToGitHub(files, { repo, isPrivate, message }) {
  const token = githubToken();
  if (!token) throw new Error("Add your GitHub token in Settings → Deploy first.");
  const paths = Object.keys(files);
  if (!paths.length) throw new Error("There are no files to push yet.");
  const name = slug(repo);
  const me = await gh("/user", token);
  let info = await gh(`/repos/${me.login}/${name}`, token, { allow404: true });
  if (!info) {
    info = await gh("/user/repos", token, {
      method: "POST",
      body: JSON.stringify({ name, private: Boolean(isPrivate), auto_init: true, description: "Built with Diji, the joyful coding agent by Dejoiy" }),
    });
  }
  const full = info.full_name;
  const branch = info.default_branch || "main";
  // A brand-new repo can take a moment before its first branch is readable.
  let ref = null;
  for (let i = 0; i < 6 && !ref; i++) {
    ref = await gh(`/repos/${full}/git/ref/heads/${branch}`, token, { allow404: true });
    if (!ref) await wait(800);
  }
  if (!ref) throw new Error("GitHub created the repository but its branch is not ready yet. Try again in a few seconds.");
  const parent = await gh(`/repos/${full}/git/commits/${ref.object.sha}`, token);
  const tree = await gh(`/repos/${full}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: paths.map((p) => ({ path: p, mode: "100644", type: "blob", content: files[p] })) }),
  });
  const commit = await gh(`/repos/${full}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({ message: message || "Update from Diji", tree: tree.sha, parents: [ref.object.sha] }),
  });
  await gh(`/repos/${full}/git/refs/heads/${branch}`, token, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  return { repo: name, fullName: full, url: info.html_url, commitUrl: `${info.html_url}/commit/${commit.sha}`, files: paths.length };
}

export async function deployToVercel(files, { name }) {
  const token = vercelToken();
  if (!token) throw new Error("Add your Vercel token in Settings → Deploy first.");
  if (!Object.keys(files).length) throw new Error("There are no files to deploy yet.");
  const res = await fetch(apiBase() + "/api/deploy", {
    method: "POST",
    headers: apiBase() ? serverHeaders() : { "content-type": "application/json" },
    body: JSON.stringify({ token, team: providerSettings("vercel").team || "", name: slug(name), files }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Deploy failed (${res.status}).`);
  return j;
}
