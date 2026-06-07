import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { workspaceEngine } from "@dejoiy/workspace-engine";

export interface GitStatus {
  branch: string;
  staged: string[];
  modified: string[];
  untracked: string[];
  clean: boolean;
}

export interface GitDiff {
  file: string;
  diff: string;
  status: "added" | "modified" | "deleted";
}

export interface GitCommitPreview {
  message: string;
  files: string[];
  diff: string;
}

export class GitEngine {
  private getCwd(workspaceId: string): string {
    return workspaceEngine.getRootPath(workspaceId);
  }

  private exec(workspaceId: string, command: string): string {
    const cwd = this.getCwd(workspaceId);
    if (!existsSync(join(cwd, ".git"))) {
      execSync("git init", { cwd, encoding: "utf-8" });
    }
    return execSync(command, { cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }).trim();
  }

  isGitRepo(workspaceId: string): boolean {
    return existsSync(join(this.getCwd(workspaceId), ".git"));
  }

  init(workspaceId: string): void {
    const cwd = this.getCwd(workspaceId);
    if (!this.isGitRepo(workspaceId)) {
      execSync("git init", { cwd, encoding: "utf-8" });
    }
  }

  status(workspaceId: string): GitStatus {
    this.init(workspaceId);

    const branch = this.exec(workspaceId, "git branch --show-current") || "main";
    const statusOutput = this.exec(workspaceId, "git status --porcelain");

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of statusOutput.split("\n").filter(Boolean)) {
      const index = line[0];
      const workTree = line[1];
      const file = line.slice(3);

      if (index === "?" && workTree === "?") {
        untracked.push(file);
      } else if (index !== " " && index !== "?") {
        staged.push(file);
      } else if (workTree === "M" || workTree === "D") {
        modified.push(file);
      }
    }

    return {
      branch,
      staged,
      modified,
      untracked,
      clean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
    };
  }

  diff(workspaceId: string, file?: string): GitDiff[] {
    this.init(workspaceId);

    const cmd = file ? `git diff HEAD -- "${file}"` : "git diff HEAD";
    const diffOutput = this.exec(workspaceId, cmd);

    if (!diffOutput) return [];

    const diffs: GitDiff[] = [];
    const fileDiffs = diffOutput.split(/^diff --git/m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const match = fileDiff.match(/a\/(.+?) b\//);
      const fileName = match?.[1] ?? file ?? "unknown";

      let status: GitDiff["status"] = "modified";
      if (fileDiff.includes("new file mode")) status = "added";
      if (fileDiff.includes("deleted file mode")) status = "deleted";

      diffs.push({ file: fileName, diff: fileDiff.trim(), status });
    }

    return diffs;
  }

  branches(workspaceId: string): string[] {
    this.init(workspaceId);
    const output = this.exec(workspaceId, "git branch -a");
    return output
      .split("\n")
      .map((b) => b.replace(/^\*?\s+/, "").replace("remotes/origin/", ""))
      .filter(Boolean);
  }

  checkout(workspaceId: string, branch: string): void {
    this.init(workspaceId);
    this.exec(workspaceId, `git checkout "${branch}"`);
  }

  createBranch(workspaceId: string, branch: string): void {
    this.init(workspaceId);
    this.exec(workspaceId, `git checkout -b "${branch}"`);
  }

  stage(workspaceId: string, files: string[]): void {
    this.init(workspaceId);
    for (const file of files) {
      this.exec(workspaceId, `git add "${file}"`);
    }
  }

  commitPreview(workspaceId: string, message: string, files?: string[]): GitCommitPreview {
    this.init(workspaceId);

    if (files?.length) {
      this.stage(workspaceId, files);
    }

    const diff = this.exec(workspaceId, "git diff --cached");
    const stagedFiles = this.exec(workspaceId, "git diff --cached --name-only")
      .split("\n")
      .filter(Boolean);

    return { message, files: stagedFiles, diff };
  }

  commit(workspaceId: string, message: string, files?: string[]): string {
    this.init(workspaceId);

    if (files?.length) {
      this.stage(workspaceId, files);
    }

    const escaped = message.replace(/"/g, '\\"');
    return this.exec(workspaceId, `git commit -m "${escaped}"`);
  }

  clone(url: string, workspaceId: string): void {
    const cwd = workspaceEngine.ensureWorkspaceDir(workspaceId);
    execSync(`git clone "${url}" .`, { cwd, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  }

  log(workspaceId: string, count = 10): Array<{ hash: string; message: string; author: string; date: string }> {
    this.init(workspaceId);
    const output = this.exec(
      workspaceId,
      `git log -${count} --format="%H|%s|%an|%ai"`
    );

    return output.split("\n").filter(Boolean).map((line) => {
      const [hash, message, author, date] = line.split("|");
      return { hash: hash ?? "", message: message ?? "", author: author ?? "", date: date ?? "" };
    });
  }
}

export const gitEngine = new GitEngine();
