---
name: git
description: Clean commits, branches and recovery from git mistakes.
---
# Git Workflow

- Small commits that each do one thing, messages in the imperative: "Add password reset email".
- Branch per feature (`feat/login`, `fix/cart-total`), open a PR, squash or rebase-merge to keep main readable.
- Before risky operations, make a safety branch: `git branch backup/<name>`.
- Recovery: lost commits → `git reflog`; undo last commit but keep changes → `git reset --soft HEAD~1`; discard a file's changes → `git restore <file>`; undo a pushed commit safely → `git revert <sha>`.
- Never force-push to shared branches; use `--force-with-lease` on your own.
- Keep secrets out: `.gitignore` for `.env`, node_modules, build output. If a secret was committed, rotate it, then clean history.
- Explain each command before suggesting anything destructive.
