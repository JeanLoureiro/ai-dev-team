import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../src/anthropic";
import { estimateCostUsd } from "../src/pricing";

const anthropicResponse: Anthropic.Message = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-4-5",
  stop_reason: "tool_use",
  stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 42 } as Anthropic.Usage,
  content: [
    { type: "text", text: "reading file", citations: null },
    {
      type: "tool_use",
      id: "toolu_1",
      name: "read_file",
      input: { path: "src/a.ts" },
    },
  ],
} as Anthropic.Message;

describe("AnthropicProvider", () => {
  it("maps requests and responses", async () => {
    let captured: Anthropic.MessageCreateParamsNonStreaming | undefined;
    const provider = new AnthropicProvider({
      apiKey: "test-key",
      createMessage: async (params) => {
        captured = params;
        return anthropicResponse;
      },
    });

    const response = await provider.createMessage({
      model: "claude-sonnet-4-5",
      system: "You are the planner.",
      maxTokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "plan this" },
            {
              type: "tool_result",
              toolUseId: "prev",
              content: "result",
              isError: false,
            },
          ],
        },
      ],
      tools: [
        {
          name: "read_file",
          description: "read a file",
          inputSchema: { type: "object" },
        },
      ],
      toolChoice: { tool: "submit_plan" },
    });

    expect(captured?.model).toBe("claude-sonnet-4-5");
    expect(captured?.system).toBe("You are the planner.");
    expect((captured?.tools?.[0] as Anthropic.Tool).name).toBe("read_file");
    expect(captured?.tool_choice).toEqual({ type: "tool", name: "submit_plan" });
    const msg = captured?.messages[0];
    expect(msg?.role).toBe("user");

    expect(response.stopReason).toBe("tool_use");
    expect(response.usage).toEqual({ inputTokens: 100, outputTokens: 42 });
    const toolUse = response.content.find((b) => b.type === "tool_use");
    expect(toolUse).toMatchObject({
      id: "toolu_1",
      name: "read_file",
      input: { path: "src/a.ts" },
    });
  });
});

describe("estimateCostUsd", () => {
  it("estimates cost for known models", () => {
    const cost = estimateCostUsd("claude-sonnet-4-5-20250929", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(18);
  });

  it("returns 0 for unknown models", () => {
    expect(
      estimateCostUsd("unknown-model", { inputTokens: 1, outputTokens: 1 }),
    ).toBe(0);
  });
});
