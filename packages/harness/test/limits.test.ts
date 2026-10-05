import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_LIMITS } from "@ai-dev-team/types";
import { evaluateLimits } from "../src/limits";

const usage = {
  iterations: 1,
  startedAt: new Date("2026-10-03T00:00:00Z"),
  tokenUsage: { inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.01 },
  now: new Date("2026-10-03T00:01:00Z"),
};

describe("evaluateLimits", () => {
  it("passes when under all limits", () => {
    expect(evaluateLimits(usage, DEFAULT_RUN_LIMITS).exceeded).toBe(false);
  });

  it("exceeds on iterations", () => {
    const check = evaluateLimits(
      { ...usage, iterations: DEFAULT_RUN_LIMITS.maxIterations + 1 },
      DEFAULT_RUN_LIMITS,
    );
    expect(check.exceeded).toBe(true);
    expect(check.reason).toContain("iterations");
  });

  it("exceeds on duration", () => {
    const check = evaluateLimits(
      { ...usage, now: new Date("2026-10-03T01:00:00Z") },
      DEFAULT_RUN_LIMITS,
    );
    expect(check.exceeded).toBe(true);
    expect(check.reason).toContain("duration");
  });

  it("exceeds on tokens", () => {
    const check = evaluateLimits(
      {
        ...usage,
        tokenUsage: {
          inputTokens: DEFAULT_RUN_LIMITS.maxTokens,
          outputTokens: 1,
          estimatedCostUsd: 1,
        },
      },
      DEFAULT_RUN_LIMITS,
    );
    expect(check.exceeded).toBe(true);
    expect(check.reason).toContain("tokens");
  });

  it("exceeds on cost", () => {
    const check = evaluateLimits(
      {
        ...usage,
        tokenUsage: { inputTokens: 10, outputTokens: 10, estimatedCostUsd: 99 },
      },
      DEFAULT_RUN_LIMITS,
    );
    expect(check.exceeded).toBe(true);
    expect(check.reason).toContain("cost");
  });
});
