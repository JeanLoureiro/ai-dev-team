import { z } from "zod";
import type { AgentType } from "@ai-dev-team/types";
import {
  emitEvent,
  HarnessError,
  type AgentHarness,
  type EventSink,
} from "@ai-dev-team/harness";
import {
  sumUsage,
  toolResultMessage,
  toolUseBlocks,
  userText,
  type LlmMessage,
  type LlmProvider,
  type LlmResponse,
  type LlmToolResultBlock,
  type LlmUsage,
} from "@ai-dev-team/llm";

const MAX_TOOL_RESULT_CHARS = 20_000;

export type OutputTool<T> = {
  name: string;
  description: string;
  schema: z.ZodType<T>;
};

export type AgentLoopInput<T> = {
  runId: string;
  agent: AgentType;
  llm: LlmProvider;
  harness: AgentHarness;
  events: EventSink;
  model: string;
  system: string;
  task: string;
  outputTool: OutputTool<T>;
  maxIterations: number;
  maxTokensPerRequest?: number;
};

export type AgentLoopResult<T> = {
  output: T;
  usage: LlmUsage;
  iterations: number;
};

/**
 * Bounded agent loop. The model alternates between harness-mediated tool
 * calls and reasoning until it calls the output tool, whose input is
 * validated against a zod schema — this is how agents produce structured
 * outputs (docs/architecture.md section 3 "Structured LLM outputs").
 */
export async function runAgentLoop<T>(
  input: AgentLoopInput<T>,
): Promise<AgentLoopResult<T>> {
  const { runId, agent, llm, harness, events, outputTool } = input;
  const maxTokens = input.maxTokensPerRequest ?? 8192;

  const tools = [
    ...harness.toolDefinitions(),
    {
      name: outputTool.name,
      description: outputTool.description,
      inputSchema: z.toJSONSchema(outputTool.schema) as Record<string, unknown>,
    },
  ];

  const messages: LlmMessage[] = [userText(input.task)];
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

  for (let iteration = 1; iteration <= input.maxIterations; iteration++) {
    let response: LlmResponse;
    try {
      response = await llm.createMessage({
        model: input.model,
        system: input.system,
        messages,
        tools,
        toolChoice: "auto",
        maxTokens,
      });
    } catch (error) {
      throw new HarnessError(
        "LLM_FAILURE",
        `${agent} LLM call failed on iteration ${iteration}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
    usage = sumUsage(usage, response.usage);
    messages.push({ role: "assistant", content: response.content });

    await emitEvent(events, {
      runId,
      type: "agent.output_received",
      agent,
      metadata: {
        iteration,
        stopReason: response.stopReason,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      },
    });

    const calls = toolUseBlocks(response);
    if (calls.length === 0) {
      messages.push(
        userText(
          `No tool call received. Continue working, or submit your final output by calling ${outputTool.name}.`,
        ),
      );
      continue;
    }

    const results: LlmToolResultBlock[] = [];
    for (const call of calls) {
      if (call.name === outputTool.name) {
        const parsed = outputTool.schema.safeParse(call.input);
        if (parsed.success) {
          return { output: parsed.data, usage, iterations: iteration };
        }
        results.push({
          type: "tool_result",
          toolUseId: call.id,
          isError: true,
          content: `INVALID_AGENT_OUTPUT: ${outputTool.name} rejected the input: ${parsed.error.issues
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("; ")}`,
        });
        continue;
      }

      const result = await harness.execute({
        id: call.id,
        name: call.name,
        input: call.input,
      });
      const isError = result.denied === true || result.error !== undefined;
      const body = result.error ?? JSON.stringify(result.output ?? null);
      results.push({
        type: "tool_result",
        toolUseId: call.id,
        ...(isError ? { isError: true } : {}),
        content:
          body.length > MAX_TOOL_RESULT_CHARS
            ? `${body.slice(0, MAX_TOOL_RESULT_CHARS)}\n... [truncated]`
            : body,
      });
    }
    messages.push(toolResultMessage(results));
  }

  throw new HarnessError(
    "RUN_LIMIT_EXCEEDED",
    `${agent} exceeded maxIterations ${input.maxIterations} without calling ${outputTool.name}`,
  );
}
