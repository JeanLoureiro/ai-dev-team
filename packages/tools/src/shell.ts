import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentTool } from "@ai-dev-team/types";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 50_000;
const MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Minimal shell-word splitting: quotes group words, backslash escapes.
 * Not a full shell grammar on purpose; commands are executed without a
 * shell, so metacharacters (`&&`, `|`, `;`, `$(...)`) are inert argv.
 */
export function splitCommand(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let hasCurrent = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    if (quote === null && (ch === " " || ch === "\t")) {
      if (hasCurrent) {
        args.push(current);
        current = "";
        hasCurrent = false;
      }
      continue;
    }
    if (quote === null && (ch === "'" || ch === '"')) {
      quote = ch;
      hasCurrent = true;
      continue;
    }
    if (quote === ch) {
      quote = null;
      continue;
    }
    if (ch === "\\" && quote !== "'" && i + 1 < command.length) {
      current += command[++i];
      hasCurrent = true;
      continue;
    }
    current += ch;
    hasCurrent = true;
  }
  if (quote !== null) throw new Error(`Unclosed quote in command: ${command}`);
  if (hasCurrent) args.push(current);
  return args;
}

export type CommandResult = {
  command: string;
  argv: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

/**
 * Environment for spawned commands: deliberately minimal so agent-run
 * commands never inherit API keys or other secrets from the host.
 */
export function commandEnv(): Record<string, string> {
  return {
    CI: "1",
    FORCE_COLOR: "0",
    LANG: process.env.LANG ?? "en_US.UTF-8",
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/local/bin",
    HOME: process.env.HOME ?? "/tmp",
    TERM: "dumb",
  };
}

export function truncate(text: string, max = MAX_OUTPUT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... [truncated ${text.length - max} chars]`;
}

type ExecError = {
  code?: number | string;
  killed?: boolean;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  message?: string;
};

export async function runCommand(
  command: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<CommandResult> {
  const argv = splitCommand(command);
  if (argv.length === 0) throw new Error("Empty command");
  const started = Date.now();

  try {
    const { stdout, stderr } = await execFileAsync(argv[0]!, argv.slice(1), {
      cwd,
      env: commandEnv() as NodeJS.ProcessEnv,
      maxBuffer: MAX_BUFFER,
      ...(signal ? { signal } : {}),
    });
    return {
      command,
      argv,
      exitCode: 0,
      stdout: truncate(String(stdout)),
      stderr: truncate(String(stderr)),
      durationMs: Date.now() - started,
      timedOut: false,
    };
  } catch (error) {
    const err = error as ExecError;
    const timedOut = err.killed === true || signal?.aborted === true;
    return {
      command,
      argv,
      exitCode: typeof err.code === "number" ? err.code : timedOut ? -1 : 127,
      stdout: truncate(String(err.stdout ?? "")),
      stderr: truncate(String(err.stderr ?? err.message ?? "")),
      durationMs: Date.now() - started,
      timedOut,
    };
  }
}

export function createShellTools(): AgentTool[] {
  return [
    {
      name: "run_command",
      description:
        "Run an allowlisted command in the workspace without a shell. Returns exit code and captured output.",
      inputSchema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Full command string, e.g. 'npm test'",
          },
        },
        required: ["command"],
      },
      commandInput: "command",
      execute: async (input, ctx) => {
        const { command } = input as { command: string };
        return runCommand(command, ctx.workspaceRoot, ctx.signal);
      },
    },
  ];
}
