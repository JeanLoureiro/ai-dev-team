import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { AgentTool } from "@ai-dev-team/types";
import {
  AgentHarness,
  InMemoryEventSink,
  isHarnessError,
  ToolRegistry,
} from "@ai-dev-team/harness";
import { FakeLlmProvider, type LlmResponse } from "@ai-dev-team/llm";
import { runAgentLoop } from "../src/loop";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "loop-test-"));
  await writeFile(path.join(workspace, "a.txt"), "apple");
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const echoTool: AgentTool = {
  name: "echo",
  description: "echo input",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
  execute: async (input) => ({ echoed: (input as { text: string }).text }),
};

const outputSchema = z.object({ answer: z.string() });

function setup() {
  const registry = new ToolRegistry();
  registry.register(echoTool);
  const events = new InMemoryEventSink();
  const harness = new AgentHarness({
    registry,
    events,
    workspaceRoot: workspace,
    runId: "run-1",
    agent: "planner",
    policy: {
      allowedTools: ["echo"],
      allowedPaths: [],
      deniedPaths: [],
      allowedCommands: [],
      maxExecutionTimeMs: 5_000,
      maxIterations: 5,
    },
  });
  return { events, harness };
}

const baseInput = (llm: FakeLlmProvider, harness: AgentHarness, events: InMemoryEventSink) => ({
  runId: "run-1",
  agent: "planner" as const,
  llm,
  harness,
  events,
  model: "test-model",
  system: "sys",
  task: "do the thing",
  outputTool: {
    name: "submit_answer",
    description: "submit the answer",
    schema: outputSchema,
  },
  maxIterations: 5,
});

describe("runAgentLoop", () => {
  it("executes tool calls then returns validated output", async () => {
    const llm = new FakeLlmProvider();
    llm
      .enqueue(FakeLlmProvider.toolUseResponse("echo", { text: "hi" }, "t1"))
      .enqueue(
        FakeLlmProvider.toolUseResponse(
          "submit_answer",
          { answer: "42" },
          "t2",
        ),
      );
    const { events, harness } = setup();

    const result = await runAgentLoop(baseInput(llm, harness, events));

    expect(result.output).toEqual({ answer: "42" });
    expect(result.iterations).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10 });

    // Second request must contain the tool_result as a user message.
    const second = llm.requests[1];
    const last = second?.messages.at(-1);
    const toolResult = last?.content.find((b) => b.type === "tool_result");
    expect(toolResult).toMatchObject({
      type: "tool_result",
      toolUseId: "t1",
    });
    expect((toolResult as { content: string }).content).toContain("hi");

    // Output tool is advertised alongside harness tools.
    expect(second?.tools?.map((t) => t.name)).toContain("submit_answer");
  });

  it("feeds invalid output back to the model and retries", async () => {
    const llm = new FakeLlmProvider();
    llm
      .enqueue(
        FakeLlmProvider.toolUseResponse(
          "submit_answer",
          { wrong: true },
          "t1",
        ),
      )
      .enqueue(
        FakeLlmProvider.toolUseResponse(
          "submit_answer",
          { answer: "ok" },
          "t2",
        ),
      );
    const { events, harness } = setup();

    const result = await runAgentLoop(baseInput(llm, harness, events));
    expect(result.output).toEqual({ answer: "ok" });

    const second = llm.requests[1];
    const toolResult = second?.messages
      .at(-1)
      ?.content.find((b) => b.type === "tool_result") as
      | { content: string; isError?: boolean }
      | undefined;
    expect(toolResult?.isError).toBe(true);
    expect(toolResult?.content).toContain("INVALID_AGENT_OUTPUT");
  });

  it("stops at maxIterations when the model never submits", async () => {
    const llm = new FakeLlmProvider().setHandler(
      (): LlmResponse => FakeLlmProvider.textResponse("thinking..."),
    );
    const { events, harness } = setup();

    try {
      await runAgentLoop({
        ...baseInput(llm, harness, events),
        maxIterations: 3,
      });
      throw new Error("unreachable");
    } catch (error) {
      expect(isHarnessError(error)).toBe(true);
      if (isHarnessError(error)) {
        expect(error.category).toBe("RUN_LIMIT_EXCEEDED");
      }
    }
    expect(llm.requests.length).toBe(3);
  });

  it("surfaces tool denials to the model", async () => {
    const llm = new FakeLlmProvider();
    llm
      .enqueue(
        FakeLlmProvider.toolUseResponse("unknown_tool", {}, "t1"),
      )
      .enqueue(
        FakeLlmProvider.toolUseResponse(
          "submit_answer",
          { answer: "done" },
          "t2",
        ),
      );
    const { events, harness } = setup();

    const result = await runAgentLoop(baseInput(llm, harness, events));
    expect(result.output).toEqual({ answer: "done" });

    const toolResult = llm.requests[1]?.messages
      .at(-1)
      ?.content.find((b) => b.type === "tool_result") as
      | { content: string; isError?: boolean }
      | undefined;
    expect(toolResult?.isError).toBe(true);
    expect(toolResult?.content).toContain("PERMISSION_DENIED");
  });
});
