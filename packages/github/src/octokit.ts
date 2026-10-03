import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import type { GitHubIssue, PullRequestInfo } from "@ai-dev-team/types";
import type {
  CommitFile,
  CreatePullRequestInput,
  GitHubClient,
  RepoRef,
} from "./client";

export type GitHubAuthConfig =
  | { type: "token"; token: string }
  | {
      type: "app";
      appId: string;
      privateKey: string;
      installationId: number;
    };

/** Build an Octokit instance from token or GitHub App credentials. */
export function createOctokit(auth: GitHubAuthConfig): Octokit {
  if (auth.type === "token") {
    return new Octokit({ auth: auth.token });
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: auth.appId,
      privateKey: auth.privateKey,
      installationId: auth.installationId,
    },
  });
}

export class OctokitGitHubClient implements GitHubClient {
  constructor(private readonly octokit: Octokit) {}

  async getIssue(repo: RepoRef, issueNumber: number): Promise<GitHubIssue> {
    const { data } = await this.octokit.rest.issues.get({
      owner: repo.owner,
      repo: repo.name,
      issue_number: issueNumber,
    });
    return {
      number: data.number,
      title: data.title,
      body: data.body ?? "",
      labels: data.labels
        .map((l) => (typeof l === "string" ? l : (l.name ?? "")))
        .filter(Boolean),
      url: data.html_url,
      state: data.state === "closed" ? "closed" : "open",
    };
  }

  async getFileTree(repo: RepoRef, ref?: string): Promise<string[]> {
    const branch = ref ?? (await this.defaultBranch(repo));
    const { data } = await this.octokit.rest.git.getTree({
      owner: repo.owner,
      repo: repo.name,
      tree_sha: branch,
      recursive: "true",
    });
    return (data.tree ?? [])
      .filter((entry) => entry.type === "blob" && entry.path)
      .map((entry) => entry.path as string);
  }

  private async defaultBranch(repo: RepoRef): Promise<string> {
    const { data } = await this.octokit.rest.repos.get({
      owner: repo.owner,
      repo: repo.name,
    });
    return data.default_branch;
  }

  async createBranch(repo: RepoRef, branch: string, fromRef?: string): Promise<void> {
    const base = fromRef ?? (await this.defaultBranch(repo));
    const { data: baseRef } = await this.octokit.rest.git.getRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${base}`,
    });
    await this.octokit.rest.git.createRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `refs/heads/${branch}`,
      sha: baseRef.object.sha,
    });
  }

  async commitFiles(
    repo: RepoRef,
    branch: string,
    files: CommitFile[],
    message: string,
  ): Promise<string> {
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${branch}`,
    });
    const baseCommit = ref.object.sha;
    const { data: baseCommitData } = await this.octokit.rest.git.getCommit({
      owner: repo.owner,
      repo: repo.name,
      commit_sha: baseCommit,
    });

    const tree = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner: repo.owner,
          repo: repo.name,
          content: Buffer.from(file.content, "utf8").toString("base64"),
          encoding: "base64",
        });
        return {
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha,
        };
      }),
    );

    const { data: newTree } = await this.octokit.rest.git.createTree({
      owner: repo.owner,
      repo: repo.name,
      base_tree: baseCommitData.tree.sha,
      tree,
    });

    const { data: commit } = await this.octokit.rest.git.createCommit({
      owner: repo.owner,
      repo: repo.name,
      message,
      tree: newTree.sha,
      parents: [baseCommit],
    });

    await this.octokit.rest.git.updateRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${branch}`,
      sha: commit.sha,
    });
    return commit.sha;
  }

  async createPullRequest(
    repo: RepoRef,
    input: CreatePullRequestInput,
  ): Promise<PullRequestInfo> {
    const { data } = await this.octokit.rest.pulls.create({
      owner: repo.owner,
      repo: repo.name,
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
    });
    return {
      number: data.number,
      url: data.html_url,
      branch: input.head,
      title: data.title,
    };
  }

  async addPullRequestComment(
    repo: RepoRef,
    pullRequestNumber: number,
    body: string,
  ): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.name,
      issue_number: pullRequestNumber,
      body,
    });
  }
}
