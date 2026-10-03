import {
  codingResultSchema,
  type CodingResult,
  type GitHubIssue,
  type ImplementationPlan,
  type RepositoryContext,
  type TestResult,
} from "@ai-dev-team/types";
import type { AgentInvocation } from "../context";
import { issuePrompt, repositoryPrompt } from "../context";
import { runAgentLoop, type AgentLoopResult } from "../loop";

const SYSTEM = `You are the Coder of AI Dev Team, an AI software engineering system.

Your job: implement an approved plan in a repository workspace.

Rules:
- Work only inside the workspace; the harness enforces which paths and commands you may use.
- Prefer edit_file for surgical changes over rewriting whole files.
- Add or update tests whenever the plan requires them.
- Verify your work by running the repository's test/typecheck/lint commands before finishing.
- Never modify CI, infrastructure, environment or secret files; they are denied by policy anyway.
- When done, call submit_result with the list of changed files and a summary.`;

export type CoderInput = {
  issue: GitHubIssue;
  repository: RepositoryContext;
  plan: ImplementationPlan;
  /** Present on retry rounds after a failed test run or review. */
  previousFailure?: {
    kind: "test_failure" | "review_changes";
    testResult?: TestResult;
    feedback?: string;
  };
};

export async function runCoder(
  invocation: AgentInvocation,
  input: CoderInput,
): Promise<AgentLoopResult<CodingResult>> {
  const failureSection = input.previousFailure
    ? `
The previous attempt failed. Fix it.
Kind: ${input.previousFailure.kind}
${input.previousFailure.feedback ? `Feedback: ${input.previousFailure.feedback}` : ""}
${
  input.previousFailure.testResult
    ? `Test results:\n${JSON.stringify(input.previousFailure.testResult.failures, null, 2)}`
    : ""
}
`
    : "";

  const task = `${repositoryPrompt(input.repository)}

${issuePrompt(input.issue)}

Approved implementation plan:
${JSON.stringify(input.plan, null, 2)}
${failureSection}
Implement the plan now. Run the relevant checks, then call submit_result.`;

  return runAgentLoop<CodingResult>({
    runId: invocation.deps.runId,
    agent: "coder",
    llm: invocation.deps.llm,
    harness: invocation.harness,
    events: invocation.deps.events,
    model: invocation.deps.model,
    system: SYSTEM,
    task,
    outputTool: {
      name: "submit_result",
      description:
        "Submit the completed implementation: changed files, summary, tests added.",
      schema: codingResultSchema,
    },
    maxIterations: invocation.harness.policy.maxIterations,
  });
}
