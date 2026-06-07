import { prisma } from "@dejoiy/database";
import { embeddingService } from "@dejoiy/embeddings";
import { workspaceEngine } from "@dejoiy/workspace-engine";

export interface IndexProgress {
  jobId: string;
  totalFiles: number;
  processed: number;
  status: string;
}

export class IndexingEngine {
  async indexWorkspace(
    workspaceId: string,
    openaiApiKey?: string,
    onProgress?: (progress: IndexProgress) => void
  ): Promise<IndexProgress> {
    const job = await prisma.indexJob.create({
      data: { workspaceId, status: "RUNNING", startedAt: new Date() },
    });

    if (openaiApiKey) {
      embeddingService.setApiKey(openaiApiKey);
    }

    try {
      const files = await workspaceEngine.scanRepository(workspaceId);
      const supportedFiles = files.filter((f) => embeddingService.isSupportedFile(f.path));

      await prisma.indexJob.update({
        where: { id: job.id },
        data: { totalFiles: supportedFiles.length },
      });

      let processed = 0;
      for (const file of supportedFiles) {
        try {
          await embeddingService.indexFile(workspaceId, file.path, file.content);
          processed++;

          await prisma.indexJob.update({
            where: { id: job.id },
            data: { processed },
          });

          if (onProgress) {
            onProgress({
              jobId: job.id,
              totalFiles: supportedFiles.length,
              processed,
              status: "RUNNING",
            });
          }
        } catch {
          // Continue indexing other files
        }
      }

      await prisma.indexJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { isIndexed: true, lastIndexed: new Date() },
      });

      return {
        jobId: job.id,
        totalFiles: supportedFiles.length,
        processed,
        status: "COMPLETED",
      };
    } catch (err) {
      await prisma.indexJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });

      throw err;
    }
  }

  async getIndexStatus(workspaceId: string): Promise<IndexProgress | null> {
    const job = await prisma.indexJob.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });

    if (!job) return null;

    return {
      jobId: job.id,
      totalFiles: job.totalFiles,
      processed: job.processed,
      status: job.status,
    };
  }
}

export const indexingEngine = new IndexingEngine();
