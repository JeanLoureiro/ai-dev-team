import Anthropic from "@anthropic-ai/sdk";
import type { ToolDefinition } from "@ai-dev-team/types";
import type {
  LlmContentBlock,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  LlmToolChoice,
} from "./types";

type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export type AnthropicProviderOptions = {
  apiKey: string;
  baseURL?: string;
  /** Injectable for tests; defaults to the real SDK call. */
  createMessage?: CreateMessage;
};

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly create: CreateMessage;

  constructor(options: AnthropicProviderOptions) {
    const client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });
    this.create =
      options.createMessage ?? client.messages.create.bind(client.messages);
  }

  async createMessage(request: LlmRequest): Promise<LlmResponse> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model,
      max_tokens: request.maxTokens,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content.map(toAnthropicBlock),
      })),
      ...(request.system !== undefined ? { system: request.system } : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.tools ? { tools: request.tools.map(toAnthropicTool) } : {}),
      ...(request.toolChoice
        ? { tool_choice: toAnthropicToolChoice(request.toolChoice) }
        : {}),
    };
    const response = await this.create(params);
    return {
      content: response.content.map(fromAnthropicBlock),
      stopReason: response.stop_reason ?? "end_turn",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  }
}

type AnthropicBlock = Anthropic.ContentBlockParam;

function toAnthropicBlock(block: LlmContentBlock): AnthropicBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        ...(block.isError !== undefined ? { is_error: block.isError } : {}),
      };
  }
}

function fromAnthropicBlock(block: Anthropic.ContentBlock): LlmContentBlock {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: block.input,
      };
    default:
      return { type: "text", text: "" };
  }
}

function toAnthropicTool(
  tool: ToolDefinition,
): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

function toAnthropicToolChoice(
  choice: LlmToolChoice,
): Anthropic.ToolChoice {
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.tool };
}
