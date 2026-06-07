import { workspaceEngine } from "@dejoiy/workspace-engine";
import { gitEngine } from "@dejoiy/git-engine";
import { terminalEngine } from "@dejoiy/terminal-engine";
import { embeddingService } from "@dejoiy/embeddings";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface ToolContext {
  workspaceId: string;
  userId: string;
  sessionId?: string;
  openaiApiKey?: string;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolResult>;

export class ToolRegistry {
  private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }> = new Map();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.name, { definition, handler });
  }

  get(name: string): { definition: ToolDefinition; handler: ToolHandler } | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: "", error: `Unknown tool: ${name}` };
    }

    try {
      return await tool.handler(args, context);
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  getOpenAITools(): Array<{
    type: "function";
    function: { name: string; description: string; parameters: { type: string; properties: Record<string, unknown>; required: string[] } };
  }> {
    return this.list().map((def) => ({
      type: "function" as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(def.parameters).map(([key, val]) => [
              key,
              { type: val.type, description: val.description },
            ])
          ),
          required: Object.entries(def.parameters)
            .filter(([, val]) => val.required)
            .map(([key]) => key),
        },
      },
    }));
  }
}

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(
    {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        path: { type: "string", description: "File path relative to workspace root", required: true },
      },
    },
    async (args, ctx) => {
      const content = await workspaceEngine.readFile(ctx.workspaceId, args.path as string);
      return { success: true, output: content, data: { path: args.path, content } };
    }
  );

  registry.register(
    {
      name: "write_file",
      description: "Write content to a file, creating or overwriting it",
      parameters: {
        path: { type: "string", description: "File path", required: true },
        content: { type: "string", description: "File content", required: true },
      },
    },
    async (args, ctx) => {
      const diff = await workspaceEngine.writeFile(ctx.workspaceId, args.path as string, args.content as string);
      return { success: true, output: diff.diff, data: diff };
    }
  );

  registry.register(
    {
      name: "edit_file",
      description: "Edit a file using line-based operations",
      parameters: {
        path: { type: "string", description: "File path", required: true },
        operations: { type: "array", description: "Array of edit operations (insert/replace/delete)", required: true },
      },
    },
    async (args, ctx) => {
      const diff = await workspaceEngine.editFile(
        ctx.workspaceId,
        args.path as string,
        args.operations as Array<{ type: "insert" | "replace" | "delete"; startLine: number; endLine?: number; content?: string }>
      );
      return { success: true, output: diff.diff, data: diff };
    }
  );

  registry.register(
    {
      name: "create_file",
      description: "Create a new file",
      parameters: {
        path: { type: "string", description: "File path", required: true },
        content: { type: "string", description: "Initial content", required: false },
      },
    },
    async (args, ctx) => {
      const diff = await workspaceEngine.createFile(
        ctx.workspaceId,
        args.path as string,
        (args.content as string) ?? ""
      );
      return { success: true, output: `Created ${args.path}`, data: diff };
    }
  );

  registry.register(
    {
      name: "delete_file",
      description: "Delete a file",
      parameters: {
        path: { type: "string", description: "File path", required: true },
      },
    },
    async (args, ctx) => {
      await workspaceEngine.deleteFile(ctx.workspaceId, args.path as string);
      return { success: true, output: `Deleted ${args.path}` };
    }
  );

  registry.register(
    {
      name: "rename_file",
      description: "Rename or move a file",
      parameters: {
        oldPath: { type: "string", description: "Current file path", required: true },
        newPath: { type: "string", description: "New file path", required: true },
      },
    },
    async (args, ctx) => {
      await workspaceEngine.renameFile(ctx.workspaceId, args.oldPath as string, args.newPath as string);
      return { success: true, output: `Renamed ${args.oldPath} to ${args.newPath}` };
    }
  );

  registry.register(
    {
      name: "read_directory",
      description: "List contents of a directory or get the full file tree",
      parameters: {
        path: { type: "string", description: "Directory path (empty for root)", required: false },
        tree: { type: "boolean", description: "Return full tree structure", required: false },
      },
    },
    async (args, ctx) => {
      if (args.tree) {
        const tree = workspaceEngine.buildTree(ctx.workspaceId, (args.path as string) ?? "");
        return { success: true, output: JSON.stringify(tree, null, 2), data: tree };
      }
      const files = await workspaceEngine.listDirectory(ctx.workspaceId, (args.path as string) ?? "");
      return { success: true, output: files.join("\n"), data: files };
    }
  );

  registry.register(
    {
      name: "search_code",
      description: "Search for text in the codebase",
      parameters: {
        query: { type: "string", description: "Search query", required: true },
        pattern: { type: "string", description: "File name pattern (regex)", required: false },
      },
    },
    async (args, ctx) => {
      const results = workspaceEngine.searchCode(
        ctx.workspaceId,
        args.query as string,
        args.pattern as string | undefined
      );
      const output = results.map((r) => `${r.filePath}:${r.line}: ${r.content}`).join("\n");
      return { success: true, output, data: results };
    }
  );

  registry.register(
    {
      name: "run_terminal_command",
      description: "Execute a terminal command in the workspace",
      parameters: {
        command: { type: "string", description: "Shell command to execute", required: true },
      },
    },
    async (args, ctx) => {
      const result = await terminalEngine.execute(
        ctx.workspaceId,
        args.command as string,
        ctx.sessionId
      );
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return {
        success: result.exitCode === 0,
        output,
        data: result,
        error: result.exitCode !== 0 ? `Exit code: ${result.exitCode}` : undefined,
      };
    }
  );

  registry.register(
    {
      name: "git_status",
      description: "Get git repository status",
      parameters: {},
    },
    async (_args, ctx) => {
      const status = gitEngine.status(ctx.workspaceId);
      return { success: true, output: JSON.stringify(status, null, 2), data: status };
    }
  );

  registry.register(
    {
      name: "git_diff",
      description: "Get git diff for changed files",
      parameters: {
        file: { type: "string", description: "Specific file path", required: false },
      },
    },
    async (args, ctx) => {
      const diffs = gitEngine.diff(ctx.workspaceId, args.file as string | undefined);
      const output = diffs.map((d) => d.diff).join("\n\n");
      return { success: true, output, data: diffs };
    }
  );

  registry.register(
    {
      name: "git_commit",
      description: "Stage and commit changes",
      parameters: {
        message: { type: "string", description: "Commit message", required: true },
        files: { type: "array", description: "Files to stage", required: false },
      },
    },
    async (args, ctx) => {
      const preview = gitEngine.commitPreview(
        ctx.workspaceId,
        args.message as string,
        args.files as string[] | undefined
      );
      const result = gitEngine.commit(
        ctx.workspaceId,
        args.message as string,
        args.files as string[] | undefined
      );
      return { success: true, output: result, data: preview };
    }
  );

  registry.register(
    {
      name: "run_tests",
      description: "Run project tests",
      parameters: {
        framework: { type: "string", description: "Test framework (jest, vitest, playwright, cypress, pytest)", required: false },
      },
    },
    async (args, ctx) => {
      const framework =
        (args.framework as string) ?? terminalEngine.detectTestFramework(ctx.workspaceId) ?? undefined;
      const result = await terminalEngine.runTests(ctx.workspaceId, framework);
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
      return {
        success: result.exitCode === 0,
        output,
        data: result,
        error: result.exitCode !== 0 ? "Tests failed" : undefined,
      };
    }
  );

  registry.register(
    {
      name: "create_embedding_search",
      description: "Perform semantic search across the indexed codebase",
      parameters: {
        query: { type: "string", description: "Natural language search query", required: true },
        limit: { type: "number", description: "Max results", required: false },
      },
    },
    async (args, ctx) => {
      if (ctx.openaiApiKey) embeddingService.setApiKey(ctx.openaiApiKey);
      const results = await embeddingService.search(
        ctx.workspaceId,
        args.query as string,
        (args.limit as number) ?? 10
      );
      const output = results
        .map((r) => `[${r.score.toFixed(2)}] ${r.filePath}:${r.startLine}-${r.endLine}\n${r.content.slice(0, 200)}`)
        .join("\n\n");
      return { success: true, output, data: results };
    }
  );

  registry.register(
    {
      name: "project_summary",
      description: "Get a summary of the project structure and technologies",
      parameters: {},
    },
    async (_args, ctx) => {
      const summary = workspaceEngine.getProjectSummary(ctx.workspaceId);
      return { success: true, output: summary, data: { summary } };
    }
  );

  registry.register(
    {
      name: "dependency_analysis",
      description: "Analyze project dependencies",
      parameters: {},
    },
    async (_args, ctx) => {
      const deps = workspaceEngine.analyzeDependencies(ctx.workspaceId);
      return { success: true, output: JSON.stringify(deps, null, 2), data: deps };
    }
  );

  registry.register(
    {
      name: "documentation_generator",
      description: "Generate documentation for a file or the entire project",
      parameters: {
        path: { type: "string", description: "File path (empty for project docs)", required: false },
      },
    },
    async (args, ctx) => {
      if (args.path) {
        const content = await workspaceEngine.readFile(ctx.workspaceId, args.path as string);
        return {
          success: true,
          output: `Documentation target: ${args.path}\n\n${content.slice(0, 5000)}`,
          data: { path: args.path, contentLength: content.length },
        };
      }
      const summary = workspaceEngine.getProjectSummary(ctx.workspaceId);
      const deps = workspaceEngine.analyzeDependencies(ctx.workspaceId);
      return {
        success: true,
        output: `# Project Documentation\n\n${summary}\n\n## Dependencies\n${JSON.stringify(deps, null, 2)}`,
        data: { summary, deps },
      };
    }
  );

  return registry;
}

export { ToolRegistry as default };
