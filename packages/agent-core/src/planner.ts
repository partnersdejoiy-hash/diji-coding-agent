import OpenAI from "openai";
import { PLANNER_PROMPT } from "@dejoiy/prompts";
import { createToolRegistry } from "@dejoiy/tools";

export interface PlanStep {
  id: number;
  description: string;
  tools: string[];
  reasoning: string;
}

export interface ExecutionPlan {
  understanding: string;
  steps: PlanStep[];
  estimatedComplexity: "low" | "medium" | "high";
  requiresVerification: boolean;
}

export class AgentPlanner {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async createPlan(task: string, context?: string): Promise<ExecutionPlan> {
    const registry = createToolRegistry();
    const availableTools = registry.list().map((t) => t.name).join(", ");

    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: PLANNER_PROMPT },
        {
          role: "user",
          content: `Task: ${task}\n\nAvailable tools: ${availableTools}${context ? `\n\nContext:\n${context}` : ""}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        understanding: task,
        steps: [{ id: 1, description: task, tools: ["read_directory"], reasoning: "Default plan" }],
        estimatedComplexity: "medium",
        requiresVerification: true,
      };
    }

    return JSON.parse(content) as ExecutionPlan;
  }
}
