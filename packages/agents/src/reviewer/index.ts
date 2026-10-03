import {
  reviewResultSchema,
  type CodingResult,
  type GitHubIssue,
  type ImplementationPlan,
  type RepositoryContext,
  type ReviewResult,
  type TestResult,
} from "@ai-dev-team/types";
import type { AgentInvocation } from "../context";
import { issuePrompt, repositoryPrompt } from "../context";
import { runAgentLoop, type AgentLoopResult } from "../loop";

const SYSTEM = `You are the Reviewer of AI Dev Team, an AI software engineering system.

Your job: review a completed implementation against the original issue, the approved plan, and the test results.

Rules:
- You have read-only access: read files, search code, and inspect the diff via git_diff.
- Judge the actual code, not the summary. Always inspect the diff before deciding.
- Approve only if the change satisfies the issue, follows the plan, and passes tests.
- blockingIssues must be things that genuinely block merging: correctness, security, missing requirements.
- suggestions are non-blocking improvements.
- When done, call submit_review exactly once.`;

export type ReviewerInput = {
  issue: GitHubIssue;
  repository: RepositoryContext;
  plan: ImplementationPlan;
  codingResult: CodingResult;
  testResult: TestResult;
};

export async function runReviewer(
  invocation: AgentInvocation,
  input: ReviewerInput,
): Promise<AgentLoopResult<ReviewResult>> {
  const task = `${repositoryPrompt(input.repository)}

${issuePrompt(input.issue)}

Approved plan:
${JSON.stringify(input.plan, null, 2)}

Coder's summary:
${JSON.stringify(input.codingResult, null, 2)}

Test results:
${JSON.stringify(
  {
    passed: input.testResult.passed,
    commands: input.testResult.commands.map((c) => ({
      command: c.command,
      exitCode: c.exitCode,
      passed: c.passed,
    })),
  },
  null,
  2,
)}

Use git_diff and read_file to inspect the implementation, then call submit_review.`;

  return runAgentLoop<ReviewResult>({
    runId: invocation.deps.runId,
    agent: "reviewer",
    llm: invocation.deps.llm,
    harness: invocation.harness,
    events: invocation.deps.events,
    model: invocation.deps.model,
    system: SYSTEM,
    task,
    outputTool: {
      name: "submit_review",
      description: "Submit the review verdict with blocking issues and suggestions.",
      schema: reviewResultSchema,
    },
    maxIterations: invocation.harness.policy.maxIterations,
  });
}
