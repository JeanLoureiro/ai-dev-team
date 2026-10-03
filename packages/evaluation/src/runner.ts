import type { AgentRun } from "@ai-dev-team/types";
import { scoreRun } from "./metrics";
import type { EvalResult, EvalTask } from "./types";

/** Minimal runner contract so evaluation does not depend on transport. */
export interface TaskRunner {
  startRun(input: {
    owner: string;
    repo: string;
    issueNumber: number;
    workspacePath: string;
    testCommands?: string[];
  }): Promise<AgentRun>;
}

/**
 * Run the evaluation dataset sequentially and score each task's run
 * (docs/architecture.md section 26). Persistence of evaluation results
 * is the caller's job (RunStore.saveOutput or the evaluations table).
 */
export async function runEvaluation(
  tasks: EvalTask[],
  runner: TaskRunner,
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const task of tasks) {
    try {
      const run = await runner.startRun({
        owner: task.repository.owner,
        repo: task.repository.name,
        issueNumber: task.issueNumber,
        workspacePath: task.workspacePath,
        ...(task.testCommands ? { testCommands: task.testCommands } : {}),
      });
      results.push(scoreRun(task, run));
    } catch (error) {
      results.push({
        taskId: task.id,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
