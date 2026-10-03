import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_TREE_ENTRIES = 2_000;

/**
 * File tree for initial agent context (docs/architecture.md section 18).
 * Uses `git ls-files` so ignored files (node_modules, build output) are
 * excluded by construction.
 */
export async function listTrackedFiles(workspacePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["-C", workspacePath, "ls-files"]);
  return stdout.split("\n").filter(Boolean).slice(0, MAX_TREE_ENTRIES);
}

/**
 * Validation commands come from repository configuration, not the LLM
 * (docs/architecture.md section 8). Default: derive from package.json
 * scripts of the target repository.
 */
export async function detectTestCommands(workspacePath: string): Promise<string[]> {
  try {
    const raw = await readFile(path.join(workspacePath, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    const commands: string[] = [];
    for (const name of ["typecheck", "lint"]) {
      if (scripts[name]) commands.push(`npm run ${name}`);
    }
    if (scripts.test) commands.push("npm test");
    return commands;
  } catch {
    return [];
  }
}

/** Default workspace location for a repo: <root>/<owner>__<name>. */
export function workspacePathFor(
  workspacesRoot: string,
  owner: string,
  name: string,
): string {
  return path.join(workspacesRoot, `${owner}__${name}`);
}
