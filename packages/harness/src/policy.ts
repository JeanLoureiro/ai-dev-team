import path from "node:path";
import picomatch from "picomatch";
import type { ToolPolicy } from "@ai-dev-team/types";
import { HarnessError } from "./errors";

/**
 * Policy enforcement lives in the harness, never in the LLM prompt
 * (docs/architecture.md section 12).
 */

/**
 * Resolve a workspace-relative path to an absolute path inside the
 * workspace. Rejects escapes (`../`, absolute paths outside the root,
 * null bytes). Returns both the absolute path and the normalized
 * relative path used for glob matching.
 */
export function resolveWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
): { abs: string; rel: string } {
  if (relativePath.includes("\0")) {
    throw new HarnessError("PERMISSION_DENIED", `Invalid path: ${relativePath}`);
  }
  const root = path.resolve(workspaceRoot);
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new HarnessError(
      "PERMISSION_DENIED",
      `Path escapes workspace: ${relativePath}`,
    );
  }
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return { abs, rel };
}

/** Normalize a policy glob: a trailing "/" means "everything under this dir". */
function normalizeGlob(pattern: string): string {
  const trimmed = pattern.trim();
  if (trimmed === "") return trimmed;
  return trimmed.endsWith("/") ? `${trimmed}**` : trimmed;
}

function matchAny(target: string, patterns: string[]): boolean {
  const normalized = patterns.map(normalizeGlob).filter((p) => p !== "");
  if (normalized.length === 0) return false;
  return picomatch(normalized, { dot: true })(target);
}

/**
 * Assert a workspace-relative path may be accessed. Denied paths win over
 * allowed paths. An empty allowedPaths means "everything not denied".
 */
export function assertPathAllowed(
  policy: ToolPolicy,
  workspaceRoot: string,
  relativePath: string,
): { abs: string; rel: string } {
  const { abs, rel } = resolveWorkspacePath(workspaceRoot, relativePath);
  const target = rel === "" ? "." : rel;

  if (matchAny(target, policy.deniedPaths)) {
    throw new HarnessError(
      "PERMISSION_DENIED",
      `Path denied by policy: ${relativePath}`,
    );
  }
  if (policy.allowedPaths.length > 0 && !matchAny(target, policy.allowedPaths)) {
    throw new HarnessError(
      "PERMISSION_DENIED",
      `Path not in allowedPaths: ${relativePath}`,
    );
  }
  return { abs, rel };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a command string against an allowlist pattern. `*` is a plain
 * wildcard (matches any characters, including "/" and whitespace);
 * everything else is literal. Patterns are anchored to the full command.
 */
export function commandMatches(command: string, pattern: string): boolean {
  const regex =
    "^" +
    pattern
      .split("")
      .map((c) => (c === "*" ? ".*" : c === "?" ? "." : escapeRegex(c)))
      .join("") +
    "$";
  return new RegExp(regex).test(command);
}

/**
 * Assert a command string is on the agent's allowlist. Patterns are
 * wildcards matched against the full command, e.g. "npm test",
 * "npm run *", "npx vitest *".
 *
 * Commands are executed without a shell (see tools/run_command), so shell
 * metacharacters are inert; the allowlist governs which argv may run.
 */
export function assertCommandAllowed(
  policy: ToolPolicy,
  command: string,
): void {
  const trimmed = command.trim();
  const allowed = policy.allowedCommands.some((pattern) =>
    commandMatches(trimmed, pattern.trim()),
  );
  if (!allowed) {
    throw new HarnessError(
      "PERMISSION_DENIED",
      `Command not allowlisted: ${command}`,
    );
  }
}
