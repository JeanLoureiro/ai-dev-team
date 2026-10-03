import type { ToolPolicy } from "@ai-dev-team/types";

/**
 * Per-agent tool policies (docs/architecture.md section 12). Enforced by
 * the harness; prompts only describe intent.
 */

/** Paths no agent may touch, regardless of role. */
export const DEFAULT_DENIED_PATHS = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  ".git/**",
  "**/*.pem",
  "**/*.key",
  "**/secrets/**",
  ".github/workflows/**",
  "infrastructure/**",
];

export function plannerPolicy(): ToolPolicy {
  return {
    allowedTools: ["read_file", "search_code", "list_files"],
    allowedPaths: [],
    deniedPaths: DEFAULT_DENIED_PATHS,
    allowedCommands: [],
    maxExecutionTimeMs: 30_000,
    maxIterations: 20,
  };
}

export function coderPolicy(testCommands: string[] = []): ToolPolicy {
  return {
    allowedTools: [
      "read_file",
      "search_code",
      "list_files",
      "write_file",
      "edit_file",
      "run_command",
      "git_diff",
    ],
    allowedPaths: [],
    deniedPaths: DEFAULT_DENIED_PATHS,
    allowedCommands: [
      ...testCommands,
      "npm run *",
      "npm test*",
      "npx *",
      "pnpm *",
      "node *",
      "git status*",
      "git diff*",
      "git log*",
      "ls",
      "ls *",
      "cat *",
    ],
    maxExecutionTimeMs: 120_000,
    maxIterations: 40,
  };
}

export function testerPolicy(testCommands: string[]): ToolPolicy {
  return {
    allowedTools: ["read_file", "list_files", "run_command"],
    allowedPaths: [],
    deniedPaths: DEFAULT_DENIED_PATHS,
    allowedCommands: testCommands,
    maxExecutionTimeMs: 300_000,
    maxIterations: 5,
  };
}

export function reviewerPolicy(): ToolPolicy {
  return {
    allowedTools: ["read_file", "search_code", "list_files", "git_diff"],
    allowedPaths: [],
    deniedPaths: DEFAULT_DENIED_PATHS,
    allowedCommands: [],
    maxExecutionTimeMs: 30_000,
    maxIterations: 20,
  };
}
