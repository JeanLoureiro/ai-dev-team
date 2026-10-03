import type { RunLimits, TokenUsage } from "@ai-dev-team/types";

export type LimitUsage = {
  iterations: number;
  startedAt: Date;
  tokenUsage: TokenUsage;
  now?: Date;
};

export type LimitCheck = {
  exceeded: boolean;
  reason?: string;
};

/**
 * Bounded execution (docs/architecture.md sections 14 and 27). When a
 * limit is exceeded the run stops with RUN_LIMIT_EXCEEDED rather than
 * continuing indefinitely.
 */
export function evaluateLimits(usage: LimitUsage, limits: RunLimits): LimitCheck {
  if (usage.iterations > limits.maxIterations) {
    return {
      exceeded: true,
      reason: `iterations ${usage.iterations} > maxIterations ${limits.maxIterations}`,
    };
  }
  const now = usage.now ?? new Date();
  const elapsedMs = now.getTime() - usage.startedAt.getTime();
  if (elapsedMs > limits.maxDurationMs) {
    return {
      exceeded: true,
      reason: `duration ${elapsedMs}ms > maxDurationMs ${limits.maxDurationMs}ms`,
    };
  }
  const totalTokens =
    usage.tokenUsage.inputTokens + usage.tokenUsage.outputTokens;
  if (totalTokens > limits.maxTokens) {
    return {
      exceeded: true,
      reason: `tokens ${totalTokens} > maxTokens ${limits.maxTokens}`,
    };
  }
  if (usage.tokenUsage.estimatedCostUsd > limits.maxCostUsd) {
    return {
      exceeded: true,
      reason: `cost $${usage.tokenUsage.estimatedCostUsd} > maxCostUsd $${limits.maxCostUsd}`,
    };
  }
  return { exceeded: false };
}
