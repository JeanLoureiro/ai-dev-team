import type { EventSink } from "@ai-dev-team/harness";
import type { LlmProvider } from "@ai-dev-team/llm";
import type { GitHubIssue, RepositoryContext } from "@ai-dev-team/types";
import type { AgentHarness } from "@ai-dev-team/harness";

/** Shared dependencies handed to every agent by the orchestrator. */
export type AgentDeps = {
  runId: string;
  llm: LlmProvider;
  events: EventSink;
  model: string;
};

export type AgentInvocation = {
  deps: AgentDeps;
  harness: AgentHarness;
};

export function issuePrompt(issue: GitHubIssue): string {
  return [
    `Issue #${issue.number}: ${issue.title}`,
    issue.labels.length > 0 ? `Labels: ${issue.labels.join(", ")}` : "",
    `URL: ${issue.url}`,
    "",
    issue.body || "(no description)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function repositoryPrompt(repo: RepositoryContext): string {
  const tree =
    repo.fileTree.length > 0
      ? repo.fileTree.slice(0, 500).join("\n")
      : "(file tree unavailable)";
  return [
    `Repository: ${repo.repository.fullName}`,
    `Default branch: ${repo.repository.defaultBranch}`,
    repo.description ? `Description: ${repo.description}` : "",
    "",
    "File tree:",
    tree,
  ]
    .filter(Boolean)
    .join("\n");
}
