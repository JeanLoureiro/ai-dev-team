import type {
  TestCommandResult,
  TestResult,
} from "@ai-dev-team/types";
import { emitEvent } from "@ai-dev-team/harness";
import type { AgentInvocation } from "../context";

export type TesterInput = {
  commands: string[];
};

/**
 * The Tester is deterministic (docs/architecture.md section 5.3): it
 * executes the repository's configured commands through the harness and
 * reports real exit codes rather than asking an LLM whether tests pass.
 */
export async function runTester(
  invocation: AgentInvocation,
  input: TesterInput,
): Promise<TestResult> {
  const { runId, events } = invocation.deps;
  const { harness } = invocation;

  await emitEvent(events, { runId, type: "test.started", agent: "tester" });

  const results: TestCommandResult[] = [];
  for (const command of input.commands) {
    const result = await harness.execute({
      id: `test-${results.length + 1}`,
      name: "run_command",
      input: { command },
    });
    if (result.denied || result.error) {
      results.push({
        command,
        exitCode: -1,
        passed: false,
        durationMs: result.durationMs ?? 0,
        stderr: result.error ?? "denied",
      });
      continue;
    }
    const out = result.output as {
      exitCode: number;
      stdout?: string;
      stderr?: string;
      durationMs: number;
      timedOut?: boolean;
    };
    results.push({
      command,
      exitCode: out.exitCode,
      passed: out.exitCode === 0,
      durationMs: out.durationMs,
      ...(out.stdout ? { stdout: out.stdout } : {}),
      ...(out.stderr ? { stderr: out.stderr } : {}),
    });
  }

  const failures = results
    .filter((r) => !r.passed)
    .map((r) => ({
      command: r.command,
      message: `exit ${r.exitCode}: ${(r.stderr || r.stdout || "").slice(0, 2_000)}`,
    }));

  const testResult: TestResult = {
    passed: failures.length === 0,
    commands: results,
    failures,
  };

  await emitEvent(events, {
    runId,
    type: "test.completed",
    agent: "tester",
    output: { passed: testResult.passed, commands: results.length },
  });
  return testResult;
}
