import type { AgentRun } from "@ai-dev-team/types";

/**
 * Evaluation model (docs/architecture.md section 26): a dataset of known
 * GitHub issues with expected outcomes, scored from persisted runs.
 */
export type EvalTask = {
  id: string;
  name: string;
  /** Repository the issue belongs to. */
  repository: { owner: string; name: string };
  issueNumber: number;
  /** Local fixture checkout used as the workspace. */
  workspacePath: string;
  /** Validation commands for the Tester. */
  testCommands?: string[];
  /** The terminal status a correct run should reach. */
  expectedStatus: AgentRun["status"];
};

export type EvalResult = {
  taskId: string;
  runId?: string;
  passed: boolean;
  actualStatus?: AgentRun["status"];
  durationMs?: number;
  costUsd?: number;
  error?: string;
};

export type EvalMetrics = {
  tasks: number;
  /** Fraction of tasks reaching their expected terminal status. */
  taskSuccessRate: number;
  /** Mean over completed tasks only; undefined when none finished. */
  averageCostUsd?: number;
  averageDurationMs?: number;
  averageIterations?: number;
};
