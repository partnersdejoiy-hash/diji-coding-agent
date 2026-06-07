import { createHash } from "crypto";
import { ChromaClient, Collection } from "chromadb";
import OpenAI from "openai";
import { prisma } from "@dejoiy/database";

const SUPPORTED_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "php", "py", "java", "go", "rs",
  "json", "yaml", "yml", "md", "html", "css", "scss",
]);

const CHUNK_SIZE = 1500;

export interface CodeChunk {
  id: string;
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface SearchResult {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
}

export class EmbeddingService {
  private client: ChromaClient;
  private openai: OpenAI | null = null;
  private collections: Map<string, Collection> = new Map();

  constructor() {
    const host = process.env.CHROMA_HOST ?? "localhost";
    const port = parseInt(process.env.CHROMA_PORT ?? "8000", 10);
    this.client = new ChromaClient({ path: `http://${host}:${port}` });
  }

  setApiKey(apiKey: string): void {
    this.openai = new OpenAI({ apiKey });
  }

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OpenAI API key not configured");
      this.openai = new OpenAI({ apiKey: key });
    }
    return this.openai;
  }

  private async getCollection(workspaceId: string): Promise<Collection> {
    const existing = this.collections.get(workspaceId);
    if (existing) return existing;

    const collection = await this.client.getOrCreateCollection({
      name: `workspace_${workspaceId.replace(/[^a-zA-Z0-9]/g, "_")}`,
      metadata: { workspaceId },
    });
    this.collections.set(workspaceId, collection);
    return collection;
  }

  isSupportedFile(filePath: string): boolean {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  chunkCode(content: string, filePath: string): CodeChunk[] {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "txt";
    const lines = content.split("\n");
    const chunks: CodeChunk[] = [];

    if (content.length <= CHUNK_SIZE) {
      chunks.push({
        id: `${filePath}:0`,
        content,
        filePath,
        startLine: 1,
        endLine: lines.length,
        language: ext,
      });
      return chunks;
    }

    let currentChunk = "";
    let startLine = 1;
    let currentLine = 1;

    for (const line of lines) {
      if (currentChunk.length + line.length > CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push({
          id: `${filePath}:${startLine}`,
          content: currentChunk.trim(),
          filePath,
          startLine,
          endLine: currentLine - 1,
          language: ext,
        });

        const overlapLines = currentChunk.split("\n").slice(-3).join("\n");
        currentChunk = overlapLines + "\n" + line + "\n";
        startLine = Math.max(1, currentLine - 3);
      } else {
        currentChunk += line + "\n";
      }
      currentLine++;
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `${filePath}:${startLine}`,
        content: currentChunk.trim(),
        filePath,
        startLine,
        endLine: lines.length,
        language: ext,
      });
    }

    return chunks;
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const hash = this.hashContent(text);

    const cached = await prisma.embeddingCache.findUnique({ where: { hash } });
    if (cached) {
      return JSON.parse(cached.embedding) as number[];
    }

    const response = await this.getOpenAI().embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error("Failed to generate embedding");

    await prisma.embeddingCache.create({
      data: { hash, content: text.slice(0, 500), embedding: JSON.stringify(embedding) },
    }).catch(() => {});

    return embedding;
  }

  async indexFile(
    workspaceId: string,
    filePath: string,
    content: string
  ): Promise<number> {
    if (!this.isSupportedFile(filePath)) return 0;

    const chunks = this.chunkCode(content, filePath);
    if (chunks.length === 0) return 0;

    const collection = await this.getCollection(workspaceId);
    const embeddings: number[][] = [];
    const ids: string[] = [];
    const metadatas: Record<string, string | number>[] = [];
    const documents: string[] = [];

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.content);
      embeddings.push(embedding);
      ids.push(`${workspaceId}:${chunk.id}`);
      documents.push(chunk.content);
      metadatas.push({
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language: chunk.language,
      });
    }

    await collection.upsert({
      ids,
      embeddings,
      documents,
      metadatas,
    });

    return chunks.length;
  }

  async search(
    workspaceId: string,
    query: string,
    limit = 10
  ): Promise<SearchResult[]> {
    const collection = await this.getCollection(workspaceId);
    const queryEmbedding = await this.generateEmbedding(query);

    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
    });

    const searchResults: SearchResult[] = [];

    if (results.documents?.[0]) {
      for (let i = 0; i < results.documents[0].length; i++) {
        const doc = results.documents[0][i];
        const meta = results.metadatas?.[0]?.[i];
        const distance = results.distances?.[0]?.[i] ?? 1;

        if (doc && meta) {
          searchResults.push({
            content: doc,
            filePath: String(meta.filePath ?? ""),
            startLine: Number(meta.startLine ?? 0),
            endLine: Number(meta.endLine ?? 0),
            score: 1 - distance,
          });
        }
      }
    }

    return searchResults.sort((a, b) => b.score - a.score);
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    try {
      await this.client.deleteCollection({
        name: `workspace_${workspaceId.replace(/[^a-zA-Z0-9]/g, "_")}`,
      });
    } catch {
      // Collection may not exist
    }
    this.collections.delete(workspaceId);
  }
}

export const embeddingService = new EmbeddingService();
