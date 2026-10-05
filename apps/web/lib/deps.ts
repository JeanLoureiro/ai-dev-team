import path from "node:path";
import {
  createOctokit,
  FakeGitHubClient,
  OctokitGitHubClient,
  type GitHubClient,
} from "@ai-dev-team/github";
import {
  AnthropicProvider,
  FakeLlmProvider,
  type LlmProvider,
} from "@ai-dev-team/llm";
import { RunOrchestrator } from "@ai-dev-team/orchestrator";
import {
  InMemoryRunStore,
  SupabaseRunStore,
  type RunStore,
} from "@ai-dev-team/store";

/**
 * Dependency wiring for the web app (docs/architecture.md section 29).
 * Singletons are cached on globalThis so Next.js dev-mode module reloads
 * keep the in-memory store alive.
 */

type Globals = typeof globalThis & {
  __aiDevTeamStore?: RunStore;
  __aiDevTeamGithub?: GitHubClient;
  __aiDevTeamOrchestrator?: RunOrchestrator;
};

const g = globalThis as Globals;

export function getStore(): RunStore {
  if (!g.__aiDevTeamStore) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    g.__aiDevTeamStore =
      url && key ? new SupabaseRunStore(url, key) : new InMemoryRunStore();
  }
  return g.__aiDevTeamStore;
}

export function getLlm(): LlmProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return new AnthropicProvider({ apiKey });
  if (process.env.AI_DEV_TEAM_FAKE_LLM === "1") return new FakeLlmProvider();
  throw new Error(
    "ANTHROPIC_API_KEY is not set (or set AI_DEV_TEAM_FAKE_LLM=1 for development)",
  );
}

export function getGithub(): GitHubClient {
  if (!g.__aiDevTeamGithub) {
    const { GITHUB_TOKEN, GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID } =
      process.env;
    if (GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY && GITHUB_APP_INSTALLATION_ID) {
      g.__aiDevTeamGithub = new OctokitGitHubClient(
        createOctokit({
          type: "app",
          appId: GITHUB_APP_ID,
          privateKey: GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
          installationId: Number(GITHUB_APP_INSTALLATION_ID),
        }),
      );
    } else if (GITHUB_TOKEN) {
      g.__aiDevTeamGithub = new OctokitGitHubClient(
        createOctokit({ type: "token", token: GITHUB_TOKEN }),
      );
    } else if (process.env.AI_DEV_TEAM_FAKE_GITHUB === "1") {
      g.__aiDevTeamGithub = new FakeGitHubClient();
    } else {
      throw new Error(
        "GitHub credentials are not configured (GITHUB_TOKEN or GitHub App env vars)",
      );
    }
  }
  return g.__aiDevTeamGithub;
}

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
}

export function getWorkspacesRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */
    process.cwd(),
    process.env.AI_DEV_TEAM_WORKSPACES ?? ".workspaces",
  );
}

export function getOrchestrator(): RunOrchestrator {
  if (!g.__aiDevTeamOrchestrator) {
    g.__aiDevTeamOrchestrator = new RunOrchestrator({
      store: getStore(),
      llm: getLlm(),
      github: getGithub(),
      workspacesRoot: getWorkspacesRoot(),
      model: getModel(),
    });
  }
  return g.__aiDevTeamOrchestrator;
}
