import type { AgentTool } from "@ai-dev-team/types";
import type { GitHubClient, RepoRef } from "./client";

/**
 * GitHub tools (docs/architecture.md section 11). These wrap the client
 * for agent use; the harness decides which agents may call them via
 * allowedTools.
 */
export function createGitHubTools(
  client: GitHubClient,
  repo: RepoRef,
  defaultBranch: string,
): AgentTool[] {
  return [
    {
      name: "get_issue",
      description: "Fetch a GitHub issue by number.",
      inputSchema: {
        type: "object",
        properties: { number: { type: "number" } },
        required: ["number"],
      },
      execute: async (input) => {
        const { number } = input as { number: number };
        return client.getIssue(repo, number);
      },
    },
    {
      name: "create_branch",
      description: "Create a branch from the default branch.",
      inputSchema: {
        type: "object",
        properties: { branch: { type: "string" } },
        required: ["branch"],
      },
      execute: async (input) => {
        const { branch } = input as { branch: string };
        await client.createBranch(repo, branch, defaultBranch);
        return { branch };
      },
    },
    {
      name: "create_pull_request",
      description: "Open a pull request for a branch.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          head: { type: "string" },
        },
        required: ["title", "body", "head"],
      },
      execute: async (input) => {
        const { title, body, head } = input as {
          title: string;
          body: string;
          head: string;
        };
        return client.createPullRequest(repo, {
          title,
          body,
          head,
          base: defaultBranch,
        });
      },
    },
    {
      name: "add_pull_request_comment",
      description: "Comment on a pull request.",
      inputSchema: {
        type: "object",
        properties: {
          pullRequestNumber: { type: "number" },
          body: { type: "string" },
        },
        required: ["pullRequestNumber", "body"],
      },
      execute: async (input) => {
        const { pullRequestNumber, body } = input as {
          pullRequestNumber: number;
          body: string;
        };
        await client.addPullRequestComment(repo, pullRequestNumber, body);
        return { commented: true };
      },
    },
  ];
}
