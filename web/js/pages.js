// Full-page views beside the chat: Projects (instructions + knowledge, like Claude Projects) and
// Artifacts (a gallery of everything Diji has built, across chats).
import { state, save, uid } from "./store.js";
import { icon } from "./icons.js";
import { esc } from "./markdown.js";
import { buildPreview } from "./workspace.js";
import { toast } from "./notify.js";

const ago = (ts) => {
  const s = (Date.now() - ts) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(ts).toLocaleDateString();
};

export function createProject(name) {
  const p = { id: uid(), name: name.trim().slice(0, 60) || "Untitled project", instructions: "", files: {}, created: Date.now() };
  state.projects.unshift(p);
  save();
  return p;
}

export function renderProjects(el, h) {
  const list = state.projects;
  el.innerHTML = `<div class="page-inner">
    <header class="page-head"><h2>Projects</h2>
      <button type="button" class="btn-primary" data-new-project>${icon("plus", 16)} New project</button></header>
    <p class="muted page-sub">Group chats that share instructions and knowledge files. Diji reads them in every chat inside the project.</p>
    ${list.length
      ? `<div class="proj-grid">${list
          .map((p) => {
            const n = state.chats.filter((c) => c.projectId === p.id && !c.incognito).length;
            return `<button type="button" class="proj-card" data-open-project="${p.id}">
              <span class="proj-ic">${icon("folder", 18)}</span>
              <strong>${esc(p.name)}</strong>
              <span class="muted">${esc((p.instructions || "No instructions yet").slice(0, 90))}</span>
              <span class="proj-meta">${n} chat${n === 1 ? "" : "s"} · ${Object.keys(p.files || {}).length} files · ${ago(p.created)}</span>
            </button>`;
          })
          .join("")}</div>`
      : `<div class="page-empty">${icon("folder", 28)}<p><strong>No projects yet</strong></p><p>Make one for your portfolio, your startup or a college assignment and keep its context in one place.</p></div>`}
  </div>`;
  el.querySelector("[data-new-project]").onclick = () => {
    const name = prompt("Project name");
    if (!name) return;
    h.openProject(createProject(name).id);
  };
  el.querySelectorAll("[data-open-project]").forEach((b) => (b.onclick = () => h.openProject(b.dataset.openProject)));
}

export function renderProject(el, id, h) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return h.back();
  const chats = state.chats.filter((c) => c.projectId === p.id && !c.incognito);
  const files = Object.entries(p.files || {});
  el.innerHTML = `<div class="page-inner">
    <button type="button" class="link-btn back" data-back>${icon("arrowLeft", 14)} All projects</button>
    <header class="page-head"><h2 contenteditable="plaintext-only" spellcheck="false" data-name aria-label="Project name">${esc(p.name)}</h2>
      <button type="button" class="btn-primary" data-new-chat>${icon("plus", 16)} New chat in project</button></header>
    <div class="proj-layout">
      <section class="proj-chats">
        <h3>Chats</h3>
        ${chats.length
          ? `<ul class="plain-list">${chats.map((c) => `<li><button type="button" class="row-btn" data-open-chat="${c.id}">${icon("chat", 15)}<span>${esc(c.title)}</span><time>${ago(c.updated)}</time></button></li>`).join("")}</ul>`
          : `<p class="muted">No chats yet. Start one and it will use this project's instructions and files.</p>`}
      </section>
      <aside class="proj-side">
        <label class="field"><span>Instructions</span>
          <textarea rows="6" data-instructions placeholder="How Diji should work in this project, e.g. “Use React + Tailwind. Indian English. Mobile first.”">${esc(p.instructions || "")}</textarea></label>
        <div class="field"><span>Knowledge</span>
          <ul class="plain-list knowledge">${files
            .map(([name, text]) => `<li>${icon("file", 14)}<span class="mono">${esc(name)}</span><small class="muted">${Math.ceil(text.length / 1000)}k</small><button type="button" class="icon-btn tiny" data-rm-file="${esc(name)}" aria-label="Remove ${esc(name)}">${icon("x", 13)}</button></li>`)
            .join("") || `<li class="muted sm">No files yet.</li>`}</ul>
          <label class="btn-ghost sm add-file">${icon("upload", 14)} Add text or code files<input type="file" multiple hidden data-add-files></label>
        </div>
        <button type="button" class="btn-danger sm" data-delete-project>${icon("trash", 14)} Delete project</button>
      </aside>
    </div></div>`;
  el.querySelector("[data-back]").onclick = h.back;
  el.querySelector("[data-new-chat]").onclick = () => h.newChatIn(p.id);
  el.querySelectorAll("[data-open-chat]").forEach((b) => (b.onclick = () => h.openChat(b.dataset.openChat)));
  const nameEl = el.querySelector("[data-name]");
  nameEl.onblur = () => {
    p.name = nameEl.textContent.trim().slice(0, 60) || p.name;
    save();
  };
  nameEl.onkeydown = (e) => e.key === "Enter" && (e.preventDefault(), nameEl.blur());
  el.querySelector("[data-instructions]").oninput = (e) => {
    p.instructions = e.target.value.slice(0, 8000);
    save();
  };
  el.querySelector("[data-add-files]").onchange = async (e) => {
    for (const f of e.target.files) {
      if (f.size > 300_000) {
        toast(`${f.name} is over 300 KB. Add a smaller file.`, "error", { keep: false });
        continue;
      }
      p.files[f.name] = await f.text();
    }
    save();
    renderProject(el, id, h);
  };
  el.querySelectorAll("[data-rm-file]").forEach((b) => (b.onclick = () => {
    delete p.files[b.dataset.rmFile];
    save();
    renderProject(el, id, h);
  }));
  el.querySelector("[data-delete-project]").onclick = () => {
    if (!confirm(`Delete “${p.name}”? Its chats stay, outside any project.`)) return;
    state.projects = state.projects.filter((x) => x.id !== p.id);
    state.chats.forEach((c) => c.projectId === p.id && delete c.projectId);
    save();
    h.back();
  };
}

// Gallery of every chat that has something to preview. Thumbnails are live, scaled-down previews.
export function renderArtifacts(el, h) {
  const items = state.chats.filter((c) => !c.incognito && buildPreview(c.files || {})).slice(0, 36);
  const other = state.chats.filter((c) => !c.incognito && Object.keys(c.files || {}).length && !buildPreview(c.files)).slice(0, 24);
  el.innerHTML = `<div class="page-inner">
    <header class="page-head"><h2>Artifacts</h2></header>
    <p class="muted page-sub">Everything Diji has built for you, in one place. Open one to keep working on it.</p>
    ${items.length || other.length
      ? `<div class="art-grid">${items
          .map((c) => `<button type="button" class="art-card" data-open-chat="${c.id}">
            <span class="art-thumb" data-thumb="${c.id}"></span>
            <span class="art-info"><strong>${esc(c.title)}</strong><small>${Object.keys(c.files).length} files · ${ago(c.updated)}</small></span>
          </button>`)
          .join("")}${other
          .map((c) => `<button type="button" class="art-card" data-open-chat="${c.id}">
            <span class="art-thumb code">${icon("code", 26)}<span class="mono">${esc(Object.keys(c.files).slice(0, 3).join("  "))}</span></span>
            <span class="art-info"><strong>${esc(c.title)}</strong><small>${Object.keys(c.files).length} files · ${ago(c.updated)}</small></span>
          </button>`)
          .join("")}</div>`
      : `<div class="page-empty">${icon("layers", 28)}<p><strong>Nothing built yet</strong></p><p>Pages, games and apps Diji makes will show up here.</p></div>`}
  </div>`;
  el.querySelectorAll("[data-open-chat]").forEach((b) => (b.onclick = () => h.openChat(b.dataset.openChat, true)));
  // Render thumbnails only when they scroll into view; each is a sandboxed, non-interactive iframe.
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const chat = state.chats.find((c) => c.id === en.target.dataset.thumb);
      const f = document.createElement("iframe");
      f.setAttribute("sandbox", "allow-scripts");
      f.setAttribute("tabindex", "-1");
      f.setAttribute("aria-hidden", "true");
      f.srcdoc = buildPreview(chat.files);
      en.target.append(f);
    }
  });
  el.querySelectorAll("[data-thumb]").forEach((t) => io.observe(t));
}
