import OpenAI from "openai";
import { prisma, Prisma } from "@dejoiy/database";
import { getModePrompt, REACT_PROMPT } from "@dejoiy/prompts";
import { shortTermMemory } from "@dejoiy/memory";
import { createToolRegistry, ToolContext, ToolResult } from "@dejoiy/tools";
import { AgentPlanner, ExecutionPlan } from "./planner.js";
import { contextEngine } from "./context-engine.js";

export interface AgentStep {
  type: "thought" | "action" | "observation" | "reflection" | "completion";
  content: string;
  tool?: string;
  toolResult?: ToolResult;
  timestamp: string;
}

export interface AgentConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  autonomyLevel: number;
  mode: string;
}

export interface AgentRunResult {
  runId: string;
  status: "completed" | "failed" | "max_steps";
  steps: AgentStep[];
  result: string;
  plan?: ExecutionPlan;
}

export type AgentEventHandler = (event: {
  type: string;
  data: unknown;
}) => void;

const MAX_STEPS_BY_AUTONOMY: Record<number, number> = {
  1: 5,
  2: 10,
  3: 20,
  4: 30,
  5: 50,
};

export class AgentLoop {
  private openai: OpenAI;
  private registry = createToolRegistry();
  private planner: AgentPlanner;

  constructor(private config: AgentConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey });
    this.planner = new AgentPlanner(config.apiKey);
  }

  async run(
    task: string,
    context: ToolContext & { currentFile?: string },
    onEvent?: AgentEventHandler
  ): Promise<AgentRunResult> {
    const run = await prisma.agentRun.create({
      data: {
        workspaceId: context.workspaceId,
        userId: context.userId,
        task,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    const steps: AgentStep[] = [];
    const maxSteps = MAX_STEPS_BY_AUTONOMY[this.config.autonomyLevel] ?? 20;

    try {
      const ctxWindow = await contextEngine.buildContext(
        context.workspaceId,
        context.userId,
        {
          currentFile: context.currentFile,
          query: task,
          openaiApiKey: context.openaiApiKey,
        }
      );

      const contextStr = contextEngine.formatContext(ctxWindow);
      const compressedContext = contextEngine.compressContext(contextStr, 60000);

      onEvent?.({ type: "planning", data: { task } });
      const plan = await this.planner.createPlan(task, compressedContext);
      steps.push({
        type: "thought",
        content: `Plan created: ${plan.understanding}. ${plan.steps.length} steps.`,
        timestamp: new Date().toISOString(),
      });

      await prisma.agentRun.update({
        where: { id: run.id },
        data: { plan: plan as unknown as Prisma.InputJsonValue },
      });

      onEvent?.({ type: "plan", data: plan });

      const systemPrompt = getModePrompt(this.config.mode);
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: `${systemPrompt}\n\n${REACT_PROMPT}` },
        {
          role: "user",
          content: `Task: ${task}\n\nPlan:\n${JSON.stringify(plan, null, 2)}\n\nContext:\n${compressedContext}`,
        },
      ];

      await shortTermMemory.setTask(
        context.sessionId ?? run.id,
        context.workspaceId,
        task
      );

      for (let step = 0; step < maxSteps; step++) {
        onEvent?.({ type: "step", data: { step, maxSteps } });

        const response = await this.openai.chat.completions.create({
          model: this.config.model,
          messages,
          tools: this.registry.getOpenAITools(),
          tool_choice: "auto",
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        });

        const choice = response.choices[0];
        if (!choice?.message) break;

        const assistantMessage = choice.message;
        messages.push(assistantMessage);

        if (assistantMessage.content) {
          const thoughtStep: AgentStep = {
            type: "thought",
            content: assistantMessage.content,
            timestamp: new Date().toISOString(),
          };
          steps.push(thoughtStep);
          onEvent?.({ type: "thought", data: thoughtStep });
        }

        if (assistantMessage.tool_calls?.length) {
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            let toolArgs: Record<string, unknown> = {};

            try {
              toolArgs = JSON.parse(toolCall.function.arguments);
            } catch {
              toolArgs = {};
            }

            const actionStep: AgentStep = {
              type: "action",
              content: `Calling ${toolName}`,
              tool: toolName,
              timestamp: new Date().toISOString(),
            };
            steps.push(actionStep);
            onEvent?.({ type: "action", data: actionStep });

            const toolResult = await this.registry.execute(toolName, toolArgs, context);

            const observationStep: AgentStep = {
              type: "observation",
              content: toolResult.output.slice(0, 5000),
              tool: toolName,
              toolResult,
              timestamp: new Date().toISOString(),
            };
            steps.push(observationStep);
            onEvent?.({ type: "observation", data: observationStep });

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                success: toolResult.success,
                output: toolResult.output.slice(0, 10000),
                error: toolResult.error,
              }),
            });

            await shortTermMemory.addMessage(
              context.sessionId ?? run.id,
              context.workspaceId,
              { role: "tool", content: `${toolName}: ${toolResult.output.slice(0, 1000)}` }
            );
          }
        } else if (choice.finish_reason === "stop") {
          const result = assistantMessage.content ?? "Task completed.";
          steps.push({
            type: "completion",
            content: result,
            timestamp: new Date().toISOString(),
          });

          await prisma.agentRun.update({
            where: { id: run.id },
            data: {
              status: "COMPLETED",
              steps: steps as unknown as Prisma.InputJsonValue,
              result,
              completedAt: new Date(),
            },
          });

          onEvent?.({ type: "complete", data: { result } });

          return { runId: run.id, status: "completed", steps, result, plan };
        }
      }

      const lastThought = steps.filter((s) => s.type === "thought").pop();
      const result = lastThought?.content ?? "Reached maximum steps.";

      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "COMPLETED",
          steps: steps as unknown as Prisma.InputJsonValue,
          result,
          completedAt: new Date(),
        },
      });

      return { runId: run.id, status: "max_steps", steps, result, plan };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);

      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error,
          steps: steps as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });

      onEvent?.({ type: "error", data: { error } });

      return { runId: run.id, status: "failed", steps, result: error };
    }
  }

  async chat(
    message: string,
    context: ToolContext & { currentFile?: string; history?: Array<{ role: string; content: string }> },
    onStream?: (chunk: string) => void
  ): Promise<string> {
    const ctxWindow = await contextEngine.buildContext(
      context.workspaceId,
      context.userId,
      {
        currentFile: context.currentFile,
        query: message,
        openaiApiKey: context.openaiApiKey,
      }
    );

    const contextStr = contextEngine.formatContext(ctxWindow);
    const systemPrompt = getModePrompt(this.config.mode);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: `${systemPrompt}\n\n${contextStr}` },
    ];

    if (context.history) {
      for (const msg of context.history.slice(-20)) {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    messages.push({ role: "user", content: message });

    if (this.config.mode === "AGENT") {
      const result = await this.run(message, context);
      return result.result;
    }

    const useTools = ["AGENT", "REFACTOR"].includes(this.config.mode);

    if (useTools) {
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        tools: this.registry.getOpenAITools(),
        tool_choice: "auto",
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: Boolean(onStream),
      });

      if (onStream && "stream" in response) {
        let fullContent = "";
        for await (const chunk of response as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          fullContent += delta;
          onStream(delta);
        }
        return fullContent;
      }

      return (response as OpenAI.Chat.Completions.ChatCompletion).choices[0]?.message?.content ?? "";
    }

    const stream = await this.openai.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: true,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      fullContent += delta;
      onStream?.(delta);
    }

    await shortTermMemory.addMessage(
      context.sessionId ?? "default",
      context.workspaceId,
      { role: "user", content: message }
    );
    await shortTermMemory.addMessage(
      context.sessionId ?? "default",
      context.workspaceId,
      { role: "assistant", content: fullContent }
    );

    return fullContent;
  }
}

export { AgentPlanner } from "./planner.js";
export { ContextEngine, contextEngine } from "./context-engine.js";
export { IndexingEngine, indexingEngine } from "./indexing-engine.js";
