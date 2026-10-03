import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentTool } from "@ai-dev-team/types";
import { commandEnv, truncate } from "./shell";

const execFileAsync = promisify(execFile);
const MAX_DIFF_CHARS = 80_000;

async function git(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      env: commandEnv() as NodeJS.ProcessEnv,
      maxBuffer: 16 * 1024 * 1024,
      ...(signal ? { signal } : {}),
    });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const err = error as {
      code?: number | string;
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
    };
    return {
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? err.message ?? ""),
    };
  }
}

export function createGitTools(): AgentTool[] {
  return [
    {
      name: "git_diff",
      description:
        "Show the working tree diff of the workspace (git diff). Optionally scoped to paths or staged changes.",
      inputSchema: {
        type: "object",
        properties: {
          staged: { type: "boolean" },
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Limit the diff to these workspace-relative paths",
          },
        },
      },
      pathInputs: ["paths"],
      execute: async (input, ctx) => {
        const { staged = false, paths = [] } = input as {
          staged?: boolean;
          paths?: string[];
        };
        const args = ["diff"];
        if (staged) args.push("--staged");
        if (paths.length > 0) args.push("--", ...paths);
        const result = await git(args, ctx.workspaceRoot, ctx.signal);
        return {
          diff: truncate(result.stdout, MAX_DIFF_CHARS),
          exitCode: result.exitCode,
          stderr: result.stderr.slice(0, 2_000),
        };
      },
    },
  ];
}
