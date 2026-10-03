import type { AgentRun } from "@ai-dev-team/types";
import type { EvalMetrics, EvalResult, EvalTask } from "./types";

export function scoreRun(task: EvalTask, run: AgentRun): EvalResult {
  const durationMs =
    run.completedAt !== undefined
      ? run.completedAt.getTime() - run.startedAt.getTime()
      : undefined;
  return {
    taskId: task.id,
    runId: run.id,
    passed: run.status === task.expectedStatus,
    actualStatus: run.status,
    ...(durationMs !== undefined ? { durationMs } : {}),
    costUsd: run.tokenUsage.estimatedCostUsd,
    ...(run.error ? { error: `${run.error.category}: ${run.error.message}` } : {}),
  };
}

export function computeMetrics(
  results: EvalResult[],
  runs: AgentRun[],
): EvalMetrics {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const completed = results.filter((r) => r.actualStatus !== undefined);
  const passed = results.filter((r) => r.passed);

  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const durations = completed
    .map((r) => r.durationMs)
    .filter((v): v is number => v !== undefined);
  const costs = completed
    .map((r) => r.costUsd)
    .filter((v): v is number => v !== undefined);
  const iterations = completed
    .map((r) => (r.runId ? byId.get(r.runId)?.iterationCount : undefined))
    .filter((v): v is number => v !== undefined);

  const metrics: EvalMetrics = {
    tasks: results.length,
    taskSuccessRate: results.length === 0 ? 0 : passed.length / results.length,
  };
  if (durations.length > 0)
    metrics.averageDurationMs = sum(durations) / durations.length;
  if (costs.length > 0) metrics.averageCostUsd = sum(costs) / costs.length;
  if (iterations.length > 0)
    metrics.averageIterations = sum(iterations) / iterations.length;
  return metrics;
}
