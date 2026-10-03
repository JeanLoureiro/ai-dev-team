import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentTool, ToolPolicy } from "@ai-dev-team/types";
import { AgentHarness } from "../src/harness";
import { InMemoryEventSink } from "../src/events";
import { ToolRegistry } from "../src/registry";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "harness-test-"));
  await writeFile(path.join(workspace, "hello.txt"), "hi there");
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const readFileTool: AgentTool = {
  name: "read_file",
  description: "read a file",
  inputSchema: { type: "object", properties: { path: { type: "string" } } },
  pathInputs: ["path"],
  execute: async (input, ctx) => {
    const { readFile } = await import("node:fs/promises");
    const p = path.resolve(
      ctx.workspaceRoot,
      (input as { path: string }).path,
    );
    return { content: await readFile(p, "utf8") };
  },
};

const runCommandTool: AgentTool = {
  name: "run_command",
  description: "run a command",
  inputSchema: { type: "object", properties: { command: { type: "string" } } },
  commandInput: "command",
  execute: async () => ({ exitCode: 0 }),
};

function makeHarness(policy: Partial<ToolPolicy> = {}) {
  const registry = new ToolRegistry();
  registry.registerAll([readFileTool, runCommandTool]);
  const events = new InMemoryEventSink();
  const harness = new AgentHarness({
    registry,
    events,
    workspaceRoot: workspace,
    runId: "run-1",
    agent: "coder",
    policy: {
      allowedTools: ["read_file", "run_command"],
      allowedPaths: [],
      deniedPaths: [".env"],
      allowedCommands: ["npm test"],
      maxExecutionTimeMs: 5_000,
      maxIterations: 10,
      ...policy,
    },
  });
  return { harness, events };
}

describe("AgentHarness.execute", () => {
  it("executes an allowed tool and records events", async () => {
    const { harness, events } = makeHarness();
    const result = await harness.execute({
      id: "c1",
      name: "read_file",
      input: { path: "hello.txt" },
    });
    expect(result.error).toBeUndefined();
    expect((result.output as { content: string }).content).toBe("hi there");

    const types = events.events.map((e) => e.type);
    expect(types).toEqual(["tool.requested", "tool.completed"]);
    expect(events.events[0]?.agent).toBe("coder");
    expect(events.events[1]?.metadata?.success).toBe(true);
  });

  it("denies tools not in the policy", async () => {
    const { harness, events } = makeHarness({
      allowedTools: ["run_command"],
    });
    const result = await harness.execute({
      id: "c2",
      name: "read_file",
      input: { path: "hello.txt" },
    });
    expect(result.denied).toBe(true);
    expect(result.error).toContain("PERMISSION_DENIED");
    expect(events.events.map((e) => e.type)).toEqual([
      "tool.requested",
      "tool.denied",
    ]);
  });

  it("denies path access outside the policy", async () => {
    const { harness } = makeHarness();
    for (const p of [".env", "../escape.txt", "/etc/passwd"]) {
      const result = await harness.execute({
        id: `c-${p}`,
        name: "read_file",
        input: { path: p },
      });
      expect(result.denied).toBe(true);
    }
  });

  it("denies commands not on the allowlist", async () => {
    const { harness } = makeHarness();
    const result = await harness.execute({
      id: "c3",
      name: "run_command",
      input: { command: "rm -rf /" },
    });
    expect(result.denied).toBe(true);
    expect(result.error).toContain("rm -rf /");
  });

  it("returns tool errors as results instead of throwing", async () => {
    const failing: AgentTool = {
      name: "read_file",
      description: "read a file",
      inputSchema: {},
      pathInputs: ["path"],
      execute: async () => {
        throw new Error("disk exploded");
      },
    };
    const registry = new ToolRegistry();
    registry.register(failing);
    const events = new InMemoryEventSink();
    const h = new AgentHarness({
      registry,
      events,
      workspaceRoot: workspace,
      runId: "run-1",
      agent: "coder",
      policy: {
        allowedTools: ["read_file"],
        allowedPaths: [],
        deniedPaths: [],
        allowedCommands: [],
        maxExecutionTimeMs: 5_000,
        maxIterations: 1,
      },
    });
    const result = await h.execute({
      id: "c4",
      name: "read_file",
      input: { path: "x" },
    });
    expect(result.error).toContain("TOOL_FAILURE");
    expect(result.error).toContain("disk exploded");
  });

  it("only exposes allowed tools to the LLM", () => {
    const { harness } = makeHarness({ allowedTools: ["read_file"] });
    const defs = harness.toolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(["read_file"]);
  });
});
