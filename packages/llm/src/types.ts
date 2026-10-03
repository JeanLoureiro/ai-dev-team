import type { ToolDefinition } from "@ai-dev-team/types";

/**
 * Provider-agnostic LLM interface. The orchestrator and agents talk to
 * this, never to a vendor SDK directly (docs/architecture.md section 4).
 */

export type LlmTextBlock = { type: "text"; text: string };

export type LlmToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};

export type LlmToolResultBlock = {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError?: boolean;
};

export type LlmContentBlock =
  | LlmTextBlock
  | LlmToolUseBlock
  | LlmToolResultBlock;

export type LlmRole = "user" | "assistant";

export type LlmMessage = {
  role: LlmRole;
  content: LlmContentBlock[];
};

/**
 * How the model may use tools:
 * - "auto": model decides (default)
 * - "required": model must call some tool
 * - { tool }: model must call that specific tool (used for structured
 *   outputs such as submit_plan)
 */
export type LlmToolChoice = "auto" | "required" | { tool: string };

export type LlmRequest = {
  model: string;
  system?: string;
  messages: LlmMessage[];
  tools?: ToolDefinition[];
  toolChoice?: LlmToolChoice;
  maxTokens: number;
  temperature?: number;
};

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LlmStopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | (string & {});

export type LlmResponse = {
  content: LlmContentBlock[];
  stopReason: LlmStopReason;
  usage: LlmUsage;
  model: string;
};

export interface LlmProvider {
  readonly name: string;
  createMessage(request: LlmRequest): Promise<LlmResponse>;
}

export function textBlocks(message: LlmMessage | LlmResponse): LlmTextBlock[] {
  return message.content.filter(
    (b): b is LlmTextBlock => b.type === "text",
  );
}

export function toolUseBlocks(
  message: LlmMessage | LlmResponse,
): LlmToolUseBlock[] {
  return message.content.filter(
    (b): b is LlmToolUseBlock => b.type === "tool_use",
  );
}

export function userText(text: string): LlmMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

export function toolResultMessage(results: LlmToolResultBlock[]): LlmMessage {
  return { role: "user", content: results };
}

export function sumUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}
