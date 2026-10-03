import type { GitHubIssue, PullRequestInfo } from "@ai-dev-team/types";
import type {
  CommitFile,
  CreatePullRequestInput,
  GitHubClient,
  RepoRef,
} from "./client";

type FakePullRequest = PullRequestInfo & { body: string };

/**
 * In-memory GitHub client for tests and local development without
 * credentials.
 */
export class FakeGitHubClient implements GitHubClient {
  readonly issues = new Map<string, GitHubIssue>();
  readonly branches: string[] = [];
  readonly commits: { branch: string; files: CommitFile[]; message: string }[] = [];
  readonly pullRequests: FakePullRequest[] = [];
  readonly comments: { pr: number; body: string }[] = [];
  fileTree: string[] = [];
  private nextPrNumber = 1;

  seedIssue(repo: RepoRef, issue: GitHubIssue): void {
    this.issues.set(`${repo.owner}/${repo.name}#${issue.number}`, issue);
  }

  async getIssue(repo: RepoRef, issueNumber: number): Promise<GitHubIssue> {
    const key = `${repo.owner}/${repo.name}#${issueNumber}`;
    const issue = this.issues.get(key);
    if (!issue) {
      return {
        number: issueNumber,
        title: `Issue #${issueNumber}`,
        body: "",
        labels: [],
        url: `https://github.com/${repo.owner}/${repo.name}/issues/${issueNumber}`,
        state: "open",
      };
    }
    return issue;
  }

  async getFileTree(): Promise<string[]> {
    return this.fileTree;
  }

  async createBranch(_repo: RepoRef, branch: string): Promise<void> {
    this.branches.push(branch);
  }

  async commitFiles(
    _repo: RepoRef,
    branch: string,
    files: CommitFile[],
    message: string,
  ): Promise<string> {
    this.commits.push({ branch, files, message });
    return `fake-sha-${this.commits.length}`;
  }

  async createPullRequest(
    repo: RepoRef,
    input: CreatePullRequestInput,
  ): Promise<PullRequestInfo> {
    const pr: FakePullRequest = {
      number: this.nextPrNumber++,
      url: `https://github.com/${repo.owner}/${repo.name}/pull/${this.nextPrNumber - 1}`,
      branch: input.head,
      title: input.title,
      body: input.body,
    };
    this.pullRequests.push(pr);
    return pr;
  }

  async addPullRequestComment(
    _repo: RepoRef,
    pullRequestNumber: number,
    body: string,
  ): Promise<void> {
    this.comments.push({ pr: pullRequestNumber, body });
  }
}
