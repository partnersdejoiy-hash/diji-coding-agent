import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  readdirSync,
  statSync,
  rmSync,
} from "fs";
import { join, dirname, extname, basename } from "path";
import { createHash } from "crypto";
import { prisma } from "@dejoiy/database";

const LANGUAGE_MAP: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".php": "php",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
};

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  language?: string;
  size?: number;
}

export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  diff: string;
}

export interface EditOperation {
  type: "insert" | "replace" | "delete";
  startLine: number;
  endLine?: number;
  content?: string;
}

function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_ROOT ?? join(process.cwd(), "workspaces");
}

function resolveSafePath(workspaceRoot: string, filePath: string): string {
  const resolved = join(workspaceRoot, filePath);
  const normalized = join(resolved);
  if (!normalized.startsWith(join(workspaceRoot))) {
    throw new Error("Path traversal detected");
  }
  return normalized;
}

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] ?? "plaintext";
}

function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex");
}

function generateDiff(oldContent: string, newContent: string, path: string): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const diffLines: string[] = [`--- a/${path}`, `+++ b/${path}`];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let i = 0;
  while (i < maxLen) {
    if (i >= oldLines.length) {
      diffLines.push(`+${newLines[i]}`);
    } else if (i >= newLines.length) {
      diffLines.push(`-${oldLines[i]}`);
    } else if (oldLines[i] !== newLines[i]) {
      diffLines.push(`-${oldLines[i]}`);
      diffLines.push(`+${newLines[i]}`);
    }
    i++;
  }

  return diffLines.join("\n");
}

export class WorkspaceEngine {
  getRootPath(workspaceId: string): string {
    return join(getWorkspaceRoot(), workspaceId);
  }

  ensureWorkspaceDir(workspaceId: string): string {
    const root = this.getRootPath(workspaceId);
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true });
    }
    return root;
  }

  async readFile(workspaceId: string, filePath: string): Promise<string> {
    const root = this.getRootPath(workspaceId);
    const fullPath = resolveSafePath(root, filePath);
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return readFileSync(fullPath, "utf-8");
  }

  async writeFile(
    workspaceId: string,
    filePath: string,
    content: string
  ): Promise<FileDiff> {
    const root = this.ensureWorkspaceDir(workspaceId);
    const fullPath = resolveSafePath(root, filePath);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const oldContent = existsSync(fullPath) ? readFileSync(fullPath, "utf-8") : "";
    writeFileSync(fullPath, content, "utf-8");

    await this.syncFileEntry(workspaceId, filePath, content);

    return {
      path: filePath,
      oldContent,
      newContent: content,
      diff: generateDiff(oldContent, content, filePath),
    };
  }

  async createFile(
    workspaceId: string,
    filePath: string,
    content = ""
  ): Promise<FileDiff> {
    const root = this.ensureWorkspaceDir(workspaceId);
    const fullPath = resolveSafePath(root, filePath);
    if (existsSync(fullPath)) {
      throw new Error(`File already exists: ${filePath}`);
    }
    return this.writeFile(workspaceId, filePath, content);
  }

  async editFile(
    workspaceId: string,
    filePath: string,
    operations: EditOperation[]
  ): Promise<FileDiff> {
    const content = await this.readFile(workspaceId, filePath);
    const lines = content.split("\n");

    const sorted = [...operations].sort((a, b) => b.startLine - a.startLine);

    for (const op of sorted) {
      switch (op.type) {
        case "insert":
          lines.splice(op.startLine - 1, 0, ...(op.content?.split("\n") ?? []));
          break;
        case "replace": {
          const deleteCount = (op.endLine ?? op.startLine) - op.startLine + 1;
          lines.splice(op.startLine - 1, deleteCount, ...(op.content?.split("\n") ?? []));
          break;
        }
        case "delete": {
          const deleteCount = (op.endLine ?? op.startLine) - op.startLine + 1;
          lines.splice(op.startLine - 1, deleteCount);
          break;
        }
      }
    }

    return this.writeFile(workspaceId, filePath, lines.join("\n"));
  }

  async deleteFile(workspaceId: string, filePath: string): Promise<void> {
    const root = this.getRootPath(workspaceId);
    const fullPath = resolveSafePath(root, filePath);
    if (!existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    unlinkSync(fullPath);

    await prisma.fileEntry.deleteMany({
      where: { workspaceId, path: filePath },
    });
  }

  async renameFile(
    workspaceId: string,
    oldPath: string,
    newPath: string
  ): Promise<void> {
    const root = this.getRootPath(workspaceId);
    const oldFull = resolveSafePath(root, oldPath);
    const newFull = resolveSafePath(root, newPath);

    if (!existsSync(oldFull)) {
      throw new Error(`File not found: ${oldPath}`);
    }

    const newDir = dirname(newFull);
    if (!existsSync(newDir)) {
      mkdirSync(newDir, { recursive: true });
    }

    renameSync(oldFull, newFull);

    await prisma.fileEntry.updateMany({
      where: { workspaceId, path: oldPath },
      data: { path: newPath, name: basename(newPath) },
    });
  }

  async createDirectory(workspaceId: string, dirPath: string): Promise<void> {
    const root = this.ensureWorkspaceDir(workspaceId);
    const fullPath = resolveSafePath(root, dirPath);
    mkdirSync(fullPath, { recursive: true });

    await prisma.fileEntry.upsert({
      where: { workspaceId_path: { workspaceId, path: dirPath } },
      create: {
        workspaceId,
        path: dirPath,
        name: basename(dirPath),
        isDirectory: true,
      },
      update: {},
    });
  }

  async deleteDirectory(workspaceId: string, dirPath: string): Promise<void> {
    const root = this.getRootPath(workspaceId);
    const fullPath = resolveSafePath(root, dirPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    rmSync(fullPath, { recursive: true });

    await prisma.fileEntry.deleteMany({
      where: {
        workspaceId,
        path: { startsWith: dirPath },
      },
    });
  }

  async renameDirectory(
    workspaceId: string,
    oldPath: string,
    newPath: string
  ): Promise<void> {
    const root = this.getRootPath(workspaceId);
    const oldFull = resolveSafePath(root, oldPath);
    const newFull = resolveSafePath(root, newPath);

    if (!existsSync(oldFull)) {
      throw new Error(`Directory not found: ${oldPath}`);
    }

    renameSync(oldFull, newFull);

    const entries = await prisma.fileEntry.findMany({
      where: { workspaceId, path: { startsWith: oldPath } },
    });

    for (const entry of entries) {
      const updatedPath = entry.path.replace(oldPath, newPath);
      await prisma.fileEntry.update({
        where: { id: entry.id },
        data: { path: updatedPath, name: basename(updatedPath) },
      });
    }
  }

  buildTree(workspaceId: string, dirPath = ""): FileNode[] {
    const root = this.getRootPath(workspaceId);
    const fullPath = dirPath ? resolveSafePath(root, dirPath) : root;

    if (!existsSync(fullPath)) return [];

    const entries = readdirSync(fullPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      const entryPath = dirPath ? join(dirPath, entry.name) : entry.name;
      const entryFull = join(fullPath, entry.name);

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: entryPath,
          isDirectory: true,
          children: this.buildTree(workspaceId, entryPath),
        });
      } else {
        const stat = statSync(entryFull);
        nodes.push({
          name: entry.name,
          path: entryPath,
          isDirectory: false,
          language: detectLanguage(entry.name),
          size: stat.size,
        });
      }
    }

    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async listDirectory(workspaceId: string, dirPath = ""): Promise<string[]> {
    const root = this.getRootPath(workspaceId);
    const fullPath = dirPath ? resolveSafePath(root, dirPath) : root;

    if (!existsSync(fullPath)) return [];

    return readdirSync(fullPath).filter(
      (f) => !f.startsWith(".") && f !== "node_modules"
    );
  }

  searchCode(
    workspaceId: string,
    query: string,
    filePattern?: string
  ): Array<{ filePath: string; line: number; content: string }> {
    const root = this.getRootPath(workspaceId);
    const results: Array<{ filePath: string; line: number; content: string }> = [];

    const searchDir = (dir: string): void => {
      const fullDir = join(root, dir);
      if (!existsSync(fullDir)) return;

      for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const relPath = dir ? join(dir, entry.name) : entry.name;

        if (entry.isDirectory()) {
          searchDir(relPath);
        } else {
          if (filePattern && !entry.name.match(new RegExp(filePattern))) continue;

          try {
            const content = readFileSync(join(fullDir, entry.name), "utf-8");
            const lines = content.split("\n");
            lines.forEach((line, idx) => {
              if (line.toLowerCase().includes(query.toLowerCase())) {
                results.push({ filePath: relPath, line: idx + 1, content: line.trim() });
              }
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    };

    searchDir("");
    return results.slice(0, 100);
  }

  async scanRepository(workspaceId: string): Promise<Array<{ path: string; content: string }>> {
    const root = this.getRootPath(workspaceId);
    const files: Array<{ path: string; content: string }> = [];

    const scan = (dir: string): void => {
      const fullDir = join(root, dir);
      if (!existsSync(fullDir)) return;

      for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const relPath = dir ? join(dir, entry.name) : entry.name;

        if (entry.isDirectory()) {
          scan(relPath);
        } else {
          try {
            const content = readFileSync(join(fullDir, entry.name), "utf-8");
            files.push({ path: relPath, content });
          } catch {
            // Skip binary/unreadable files
          }
        }
      }
    };

    scan("");
    return files;
  }

  getProjectSummary(workspaceId: string): string {
    const tree = this.buildTree(workspaceId);
    const fileCount = this.countFiles(tree);
    const languages = this.detectLanguages(tree);

    return [
      `Project contains ${fileCount} files`,
      `Languages: ${languages.join(", ")}`,
      `Structure:\n${this.formatTree(tree, 0)}`,
    ].join("\n");
  }

  analyzeDependencies(workspaceId: string): Record<string, string[]> {
    const root = this.getRootPath(workspaceId);
    const deps: Record<string, string[]> = {};

    const pkgPath = join(root, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, Record<string, string>>;
        deps["npm"] = [
          ...Object.keys(pkg.dependencies ?? {}),
          ...Object.keys(pkg.devDependencies ?? {}),
        ];
      } catch { /* ignore */ }
    }

    const reqPath = join(root, "requirements.txt");
    if (existsSync(reqPath)) {
      deps["python"] = readFileSync(reqPath, "utf-8")
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("#"))
        .map((l) => l.split("==")[0]?.split(">=")[0]?.trim() ?? l);
    }

    const goModPath = join(root, "go.mod");
    if (existsSync(goModPath)) {
      deps["go"] = readFileSync(goModPath, "utf-8")
        .split("\n")
        .filter((l) => l.trim().startsWith("require"))
        .map((l) => l.replace("require", "").trim().split(" ")[0] ?? l);
    }

    return deps;
  }

  getRelatedFiles(workspaceId: string, filePath: string): string[] {
    const content = this.readFileSync(workspaceId, filePath);
    const imports: string[] = [];

    const importPatterns = [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /from\s+(\S+)\s+import/g,
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) imports.push(match[1]);
      }
    }

    const root = this.getRootPath(workspaceId);
    const dir = dirname(filePath);

    return imports
      .map((imp) => {
        if (imp.startsWith(".")) {
          const resolved = join(dir, imp);
          for (const ext of ["", ".ts", ".tsx", ".js", ".jsx"]) {
            const candidate = resolved + ext;
            if (existsSync(join(root, candidate))) return candidate;
            if (existsSync(join(root, candidate, "index.ts"))) return join(candidate, "index.ts");
          }
        }
        return null;
      })
      .filter((f): f is string => f !== null);
  }

  readFileSync(workspaceId: string, filePath: string): string {
    const root = this.getRootPath(workspaceId);
    const fullPath = resolveSafePath(root, filePath);
    return readFileSync(fullPath, "utf-8");
  }

  private async syncFileEntry(
    workspaceId: string,
    filePath: string,
    content: string
  ): Promise<void> {
    await prisma.fileEntry.upsert({
      where: { workspaceId_path: { workspaceId, path: filePath } },
      create: {
        workspaceId,
        path: filePath,
        name: basename(filePath),
        isDirectory: false,
        content,
        language: detectLanguage(filePath),
        size: Buffer.byteLength(content),
        hash: hashContent(content),
      },
      update: {
        content,
        size: Buffer.byteLength(content),
        hash: hashContent(content),
      },
    });
  }

  private countFiles(tree: FileNode[]): number {
    return tree.reduce((acc, node) => {
      if (node.isDirectory) return acc + this.countFiles(node.children ?? []);
      return acc + 1;
    }, 0);
  }

  private detectLanguages(tree: FileNode[]): string[] {
    const langs = new Set<string>();
    const walk = (nodes: FileNode[]): void => {
      for (const node of nodes) {
        if (node.language) langs.add(node.language);
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
    return Array.from(langs);
  }

  private formatTree(tree: FileNode[], depth: number): string {
    return tree
      .map((node) => {
        const indent = "  ".repeat(depth);
        const prefix = node.isDirectory ? "📁" : "📄";
        let result = `${indent}${prefix} ${node.name}`;
        if (node.children) {
          result += "\n" + this.formatTree(node.children, depth + 1);
        }
        return result;
      })
      .join("\n");
  }
}

export const workspaceEngine = new WorkspaceEngine();
