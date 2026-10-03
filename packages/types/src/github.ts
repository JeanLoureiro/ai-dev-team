export type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
  state: "open" | "closed";
};

export type Repository = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  /** GitHub App installation id, when the repo is connected via an App. */
  installationId?: number;
};

/**
 * The progressive context an agent receives about a repository
 * (docs/architecture.md section 18): metadata and a file tree first,
 * then whatever the agent pulls in via tools.
 */
export type RepositoryContext = {
  repository: Repository;
  /** Absolute path of the local workspace checkout. */
  workspacePath: string;
  /** Workspace-relative file listing, used as initial context. */
  fileTree: string[];
  /**
   * Deterministic validation commands configured for this repository
   * (e.g. "npm test", "npm run lint"). Executed by the Tester through the
   * harness, never invented by the LLM.
   */
  testCommands: string[];
  description?: string;
};

export type PullRequestInfo = {
  number: number;
  url: string;
  branch: string;
  title: string;
};
