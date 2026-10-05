import {
  implementationPlanSchema,
  type GitHubIssue,
  type ImplementationPlan,
  type RepositoryContext,
} from "@ai-dev-team/types";
import type { AgentInvocation } from "../context";
import { issuePrompt, repositoryPrompt } from "../context";
import { runAgentLoop, type AgentLoopResult } from "../loop";

const SYSTEM = `You are the Planner of AI Dev Team, an AI software engineering system.

Your job: understand a GitHub issue in the context of a repository and produce a precise implementation plan.

Rules:
- You can read files, list files and search code. You cannot modify anything.
- Be economical: inspect only files relevant to the issue, and prefer search_code over listing and reading everything.
- Ground the plan in the actual code: inspect relevant files before planning.
- Be concrete: list real file paths, not vague intentions.
- Identify which existing tests cover the area and which new tests are needed.
- When done, call submit_plan exactly once with the complete plan.`;

export type PlannerInput = {
  issue: GitHubIssue;
  repository: RepositoryContext;
};

export async function runPlanner(
  invocation: AgentInvocation,
  input: PlannerInput,
): Promise<AgentLoopResult<ImplementationPlan>> {
  const task = `${repositoryPrompt(input.repository)}

${issuePrompt(input.issue)}

Inspect the repository as needed, then call submit_plan with the implementation plan.`;

  return runAgentLoop<ImplementationPlan>({
    runId: invocation.deps.runId,
    agent: "planner",
    llm: invocation.deps.llm,
    harness: invocation.harness,
    events: invocation.deps.events,
    model: invocation.deps.model,
    system: SYSTEM,
    task,
    outputTool: {
      name: "submit_plan",
      description: "Submit the implementation plan for this issue.",
      schema: implementationPlanSchema,
    },
    maxIterations: invocation.harness.policy.maxIterations,
  });
}
