import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeGitHubClient } from "@ai-dev-team/github";
import { FakeLlmProvider, type LlmRequest, type LlmResponse } from "@ai-dev-team/llm";
import { InMemoryRunStore } from "@ai-dev-team/store";
import type { GitHubIssue } from "@ai-dev-team/types";
import { RunOrchestrator } from "../src/orchestrator";

const exec = promisify(execFile);

let workspace: string;
let store: InMemoryRunStore;
let github: FakeGitHubClient;
let llm: FakeLlmProvider;

const ISSUE: GitHubIssue = {
  number: 42,
  title: "Add a greeting module",
  body: "Create src/greeting.ts exporting a greet() function.",
  labels: ["enhancement"],
  url: "https://github.com/acme/demo/issues/42",
  state: "open",
};

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "orch-test-"));
  await exec("git", ["init", "-b", "main"], { cwd: workspace });
  await exec("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
  await exec("git", ["config", "user.name", "test"], { cwd: workspace });
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await writeFile(path.join(workspace, "src/index.ts"), "export {};\n");
  await exec("git", ["add", "-A"], { cwd: workspace });
  await exec("git", ["commit", "-m", "init"], { cwd: workspace });

  store = new InMemoryRunStore();
  github = new FakeGitHubClient();
  github.seedIssue({ owner: "acme", name: "demo" }, ISSUE);
  llm = new FakeLlmProvider();
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

function orchestrator(limits?: ConstructorParameters<typeof RunOrchestrator>[0]["limits"]) {
  return new RunOrchestrator({
    store,
    llm,
    github,
    workspacesRoot: path.dirname(workspace),
    model: "claude-sonnet-4-5",
    ...(limits ? { limits } : {}),
  });
}

const startInput = {
  owner: "acme",
  repo: "demo",
  issueNumber: 42,
  testCommands: ["echo ok"],
  get workspacePath() {
    return workspace;
  },
};

function hasTool(req: LlmRequest, name: string): boolean {
  return req.tools?.some((t) => t.name === name) ?? false;
}

function happyHandler(req: LlmRequest): LlmResponse {
  if (hasTool(req, "submit_plan")) {
    return FakeLlmProvider.toolUseResponse("submit_plan", {
      summary: "Add greeting module",
      requirements: ["greet() export"],
      filesToModify: [],
      filesToCreate: ["src/greeting.ts"],
      testsRequired: ["echo ok"],
      risks: [],
    });
  }
  if (hasTool(req, "submit_result")) {
    const wrote = req.messages.some((m) =>
      m.content.some(
        (b) => b.type === "tool_result" && b.content.includes("greeting.ts"),
      ),
    );
    if (!wrote) {
      return FakeLlmProvider.toolUseResponse("write_file", {
        path: "src/greeting.ts",
        content: "export const greet = () => 'hi';\n",
      });
    }
    return FakeLlmProvider.toolUseResponse("submit_result", {
      changedFiles: ["src/greeting.ts"],
      summary: "created greeting module",
      testsAdded: [],
    });
  }
  if (hasTool(req, "submit_review")) {
    return FakeLlmProvider.toolUseResponse("submit_review", {
      approved: true,
      blockingIssues: [],
      suggestions: [],
    });
  }
  return FakeLlmProvider.textResponse("no idea");
}

describe("RunOrchestrator", () => {
  it("runs the full pipeline to awaiting_approval, then creates a PR", async () => {
    llm.setHandler(happyHandler);
    const orch = orchestrator();

    const run = await orch.startRun(startInput);
    expect(run.status).toBe("awaiting_approval");

    // the coder's file was actually written to the workspace
    const { readFile } = await import("node:fs/promises");
    const written = await readFile(path.join(workspace, "src/greeting.ts"), "utf8");
    expect(written).toContain("greet");

    const decided = await orch.decide(run.id, { decision: "approved" });
    expect(decided.status).toBe("pr_created");
    expect(decided.pullRequestNumber).toBe(1);

    expect(github.branches).toEqual(["ai-dev-team/issue-42"]);
    expect(github.commits[0]?.files[0]?.path).toBe("src/greeting.ts");
    expect(github.pullRequests[0]?.body).toContain("Closes #42");
    expect(github.pullRequests[0]?.body).toContain(run.id);

    const types = (await store.listEvents(run.id)).map((e) => e.type);
    for (const expected of [
      "run.created",
      "agent.started",
      "tool.requested",
      "plan.ready",
      "code.ready",
      "test.completed",
      "review.completed",
      "approval.requested",
      "approval.granted",
      "pull_request.created",
      "run.completed",
    ]) {
      expect(types).toContain(expected);
    }
    expect(types.indexOf("plan.ready")).toBeLessThan(types.indexOf("code.ready"));
    expect(types.indexOf("code.ready")).toBeLessThan(types.indexOf("review.completed"));
    expect(types.indexOf("approval.requested")).toBeLessThan(
      types.indexOf("pull_request.created"),
    );
  });

  it("rejects decisions before the approval gate", async () => {
    llm.setHandler(happyHandler);
    const orch = orchestrator();
    const run = await orch.startRun(startInput);
    await store.updateRun(run.id, { status: "coding" });
    await expect(orch.decide(run.id, { decision: "approved" })).rejects.toThrow(
      /awaiting_approval/,
    );
  });

  it("marks the run rejected on human rejection", async () => {
    llm.setHandler(happyHandler);
    const orch = orchestrator();
    const run = await orch.startRun(startInput);
    const decided = await orch.decide(run.id, {
      decision: "rejected",
      comment: "not what we wanted",
    });
    expect(decided.status).toBe("rejected");
    expect(decided.error?.category).toBe("HUMAN_REJECTION");
    expect(github.pullRequests).toHaveLength(0);
  });

  it("fails the run when tests keep failing after max coder iterations", async () => {
    llm.setHandler((req) => {
      if (hasTool(req, "submit_plan")) {
        return FakeLlmProvider.toolUseResponse("submit_plan", {
          summary: "s",
          requirements: [],
          filesToModify: ["src/index.ts"],
          filesToCreate: [],
          testsRequired: [],
          risks: [],
        });
      }
      return FakeLlmProvider.toolUseResponse("submit_result", {
        changedFiles: ["src/index.ts"],
        summary: "x",
        testsAdded: [],
      });
    });

    const orch = orchestrator({
      maxIterations: 100,
      maxCoderIterations: 2,
      maxDurationMs: 60_000,
      maxTokens: 1_000_000,
      maxCostUsd: 10,
    });
    const run = await orch.startRun({
      ...startInput,
      testCommands: ["false"],
    });
    expect(run.status).toBe("failed");
    expect(run.error?.category).toBe("TEST_FAILURE");
    expect(run.coderIterations).toBe(1);
  });

  it("resumes coding when changes are requested", async () => {
    llm.setHandler(happyHandler);
    const orch = orchestrator();
    const run = await orch.startRun(startInput);

    const updated = await orch.decide(run.id, {
      decision: "changes_requested",
      comment: "use a different name",
    });
    expect(updated.status).toBe("awaiting_approval");

    // pipeline went through coding again
    const types = (await store.listEvents(run.id)).map((e) => e.type);
    expect(types.filter((t) => t === "code.ready").length).toBeGreaterThanOrEqual(2);
    expect(types).toContain("approval.changes_requested");
  });

  it("records token usage on the run", async () => {
    llm.setHandler(happyHandler);
    const orch = orchestrator();
    const run = await orch.startRun(startInput);
    expect(run.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(run.iterationCount).toBeGreaterThan(0);
  });

  it("fails cleanly when the workspace is missing", async () => {
    llm.setHandler(happyHandler);
    const orch = orchestrator();
    const run = await orch.startRun({
      ...startInput,
      workspacePath: path.join(workspace, "does-not-exist"),
    });
    expect(run.status).toBe("failed");
  });
});
