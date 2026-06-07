import { workspaceEngine } from "@dejoiy/workspace-engine";
import { embeddingService } from "@dejoiy/embeddings";
import { longTermMemory } from "@dejoiy/memory";

export interface ContextWindow {
  currentFile?: { path: string; content: string };
  relatedFiles: Array<{ path: string; content: string }>;
  importedFiles: Array<{ path: string; content: string }>;
  similarFiles: Array<{ path: string; content: string; score: number }>;
  projectSummary: string;
  longTermContext: string;
  totalTokens: number;
}

const MAX_CONTEXT_CHARS = 80000;
const MAX_FILE_CHARS = 10000;

export class ContextEngine {
  async buildContext(
    workspaceId: string,
    userId: string,
    options: {
      currentFile?: string;
      query?: string;
      openaiApiKey?: string;
    } = {}
  ): Promise<ContextWindow> {
    const context: ContextWindow = {
      relatedFiles: [],
      importedFiles: [],
      similarFiles: [],
      projectSummary: "",
      longTermContext: "",
      totalTokens: 0,
    };

    let usedChars = 0;

    context.projectSummary = workspaceEngine.getProjectSummary(workspaceId);
    usedChars += context.projectSummary.length;

    context.longTermContext = await longTermMemory.buildContextString(userId, workspaceId);
    usedChars += context.longTermContext.length;

    if (options.currentFile) {
      try {
        const content = await workspaceEngine.readFile(workspaceId, options.currentFile);
        const truncated = content.slice(0, MAX_FILE_CHARS);
        context.currentFile = { path: options.currentFile, content: truncated };
        usedChars += truncated.length;

        const imports = workspaceEngine.getRelatedFiles(workspaceId, options.currentFile);
        for (const impPath of imports.slice(0, 5)) {
          if (usedChars >= MAX_CONTEXT_CHARS) break;
          try {
            const impContent = await workspaceEngine.readFile(workspaceId, impPath);
            const truncatedImp = impContent.slice(0, MAX_FILE_CHARS / 2);
            context.importedFiles.push({ path: impPath, content: truncatedImp });
            usedChars += truncatedImp.length;
          } catch { /* skip */ }
        }
      } catch { /* file not found */ }
    }

    if (options.query && options.openaiApiKey) {
      embeddingService.setApiKey(options.openaiApiKey);
      try {
        const results = await embeddingService.search(workspaceId, options.query, 5);
        for (const result of results) {
          if (usedChars >= MAX_CONTEXT_CHARS) break;
          try {
            const content = await workspaceEngine.readFile(workspaceId, result.filePath);
            const truncated = content.slice(0, MAX_FILE_CHARS / 2);
            context.similarFiles.push({
              path: result.filePath,
              content: truncated,
              score: result.score,
            });
            usedChars += truncated.length;
          } catch { /* skip */ }
        }
      } catch { /* embedding search failed */ }
    }

    context.totalTokens = Math.ceil(usedChars / 4);
    return context;
  }

  formatContext(context: ContextWindow): string {
    const parts: string[] = [];

    if (context.projectSummary) {
      parts.push(`## Project Summary\n${context.projectSummary}`);
    }

    if (context.longTermContext) {
      parts.push(`## Memory\n${context.longTermContext}`);
    }

    if (context.currentFile) {
      parts.push(`## Current File: ${context.currentFile.path}\n\`\`\`\n${context.currentFile.content}\n\`\`\``);
    }

    if (context.importedFiles.length) {
      parts.push(
        "## Imported Files\n" +
          context.importedFiles
            .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
            .join("\n\n")
      );
    }

    if (context.similarFiles.length) {
      parts.push(
        "## Semantically Related Files\n" +
          context.similarFiles
            .map((f) => `### ${f.path} (score: ${f.score.toFixed(2)})\n\`\`\`\n${f.content}\n\`\`\``)
            .join("\n\n")
      );
    }

    return parts.join("\n\n");
  }

  compressContext(context: string, maxChars: number): string {
    if (context.length <= maxChars) return context;

    const sections = context.split(/^## /m);
    const header = sections.shift() ?? "";
    let result = header;
    let remaining = maxChars - header.length;

    for (const section of sections) {
      const sectionText = "## " + section;
      if (sectionText.length <= remaining) {
        result += sectionText;
        remaining -= sectionText.length;
      } else {
        result += sectionText.slice(0, remaining) + "\n...[truncated]";
        break;
      }
    }

    return result;
  }
}

export const contextEngine = new ContextEngine();
