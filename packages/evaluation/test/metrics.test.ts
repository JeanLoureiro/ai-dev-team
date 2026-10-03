import { describe, expect, it } from "vitest";
import type { AgentRun } from "@ai-dev-team/types";
import { computeMetrics, scoreRun } from "../src/metrics";
import type { EvalTask } from "../src/types";

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-1",
    repositoryId: "repo-1",
    issueNumber: 1,
    status: "pr_created",
    startedAt: new Date("2026-10-03T00:00:00Z"),
    completedAt: new Date("2026-10-03T00:02:00Z"),
    iterationCount: 4,
    coderIterations: 1,
    tokenUsage: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.02 },
    ...overrides,
  };
}

const task: EvalTask = {
  id: "csv-export",
  name: "CSV export",
  repository: { owner: "acme", name: "demo" },
  issueNumber: 1,
  workspacePath: "/tmp/fixture",
  expectedStatus: "pr_created",
};

describe("scoreRun", () => {
  it("passes when the run reaches the expected status", () => {
    const result = scoreRun(task, makeRun());
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBe(120_000);
    expect(result.costUsd).toBeCloseTo(0.02);
  });

  it("fails otherwise", () => {
    const result = scoreRun(task, makeRun({ status: "failed" }));
    expect(result.passed).toBe(false);
  });
});

describe("computeMetrics", () => {
  it("aggregates task results", () => {
    const runs = [
      makeRun({ id: "r1", iterationCount: 2 }),
      makeRun({ id: "r2", status: "failed", iterationCount: 8 }),
    ];
    const results = [
      scoreRun(task, runs[0]!),
      scoreRun({ ...task, id: "t2" }, runs[1]!),
    ];
    const metrics = computeMetrics(results, runs);
    expect(metrics.tasks).toBe(2);
    expect(metrics.taskSuccessRate).toBe(0.5);
    expect(metrics.averageIterations).toBe(5);
    expect(metrics.averageCostUsd).toBeCloseTo(0.02);
    expect(metrics.averageDurationMs).toBeCloseTo(120_000);
  });
});
