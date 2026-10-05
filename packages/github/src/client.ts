import type { GitHubIssue, PullRequestInfo } from "@ai-dev-team/types";

export type RepoRef = {
  owner: string;
  name: string;
};

export type CreatePullRequestInput = {
  title: string;
  body: string;
  head: string;
  base: string;
};

export type CommitFile = {
  /** Repo-relative path. */
  path: string;
  content: string;
};

/**
 * GitHub integration boundary (docs/architecture.md section 20).
 * Credentials live here and in the orchestrator; they are never exposed
 * to an LLM.
 */
export interface GitHubClient {
  getIssue(repo: RepoRef, issueNumber: number): Promise<GitHubIssue>;

  /** Open issues on the repo, newest first (excludes pull requests). */
  listOpenIssues(repo: RepoRef, limit?: number): Promise<GitHubIssue[]>;

  /** Workspace-relative file listing of the default branch tree. */
  getFileTree(repo: RepoRef, ref?: string): Promise<string[]>;

  createBranch(repo: RepoRef, branch: string, fromRef?: string): Promise<void>;

  /** Single commit containing all file changes on the given branch. */
  commitFiles(
    repo: RepoRef,
    branch: string,
    files: CommitFile[],
    message: string,
  ): Promise<string>;

  createPullRequest(
    repo: RepoRef,
    input: CreatePullRequestInput,
  ): Promise<PullRequestInfo>;

  addPullRequestComment(
    repo: RepoRef,
    pullRequestNumber: number,
    body: string,
  ): Promise<void>;
}
