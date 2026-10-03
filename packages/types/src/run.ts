import type { AgentType } from "./agent";

/**
 * Run lifecycle states, mirroring the state machine in
 * docs/architecture.md section 13.
 *
 * `tests_failed` is the recoverable test-failure state that returns control
 * to the Coder; `failed` is the terminal state after retries are exhausted
 * or an unrecoverable error occurs.
 */
export const RUN_STATUSES = [
  "pending",
  "planning",
  "plan_ready",
  "coding",
  "code_ready",
  "testing",
  "reviewing",
  "review_complete",
  "awaiting_approval",
  "approved",
  "rejected",
  "pr_created",
  "failed",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

/**
 * Hard limits for a run. When exceeded the run stops with
 * RUN_LIMIT_EXCEEDED rather than continuing indefinitely.
 */
export type RunLimits = {
  /** Maximum total agent loop iterations across the run. */
  maxIterations: number;
  /** Maximum Coder attempts after a failed test round. */
  maxCoderIterations: number;
  /** Maximum wall-clock duration of a run. */
  maxDurationMs: number;
  /** Maximum total input + output tokens. */
  maxTokens: number;
  /** Maximum estimated LLM cost in USD. */
  maxCostUsd: number;
};

export const DEFAULT_RUN_LIMITS: RunLimits = {
  maxIterations: 60,
  maxCoderIterations: 3,
  maxDurationMs: 30 * 60 * 1000,
  maxTokens: 1_000_000,
  maxCostUsd: 5,
};

export type AgentRun = {
  id: string;
  repositoryId: string;
  issueNumber: number;

  status: RunStatus;

  startedAt: Date;
  completedAt?: Date;

  currentAgent?: AgentType;

  iterationCount: number;
  /** Number of Coder -> Tester retry rounds used. */
  coderIterations: number;

  tokenUsage: TokenUsage;

  branchName?: string;
  /** Absolute path of the workspace checkout used for this run. */
  workspacePath?: string;
  /** Validation commands the Tester executed, when overridden per run. */
  testCommands?: string[];
  pullRequestNumber?: number;

  /** Failure detail when status === "failed". */
  error?: RunError;
};

export type RunError = {
  category: FailureCategory;
  message: string;
  agent?: AgentType;
};

/** Failure categories from docs/architecture.md section 28. */
export const FAILURE_CATEGORIES = [
  "LLM_FAILURE",
  "TOOL_FAILURE",
  "TEST_FAILURE",
  "TIMEOUT",
  "PERMISSION_DENIED",
  "INVALID_AGENT_OUTPUT",
  "GITHUB_FAILURE",
  "RUN_LIMIT_EXCEEDED",
  "HUMAN_REJECTION",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];
