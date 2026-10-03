import path from "node:path";

/**
 * Resolve a workspace-relative path inside the workspace root.
 * The harness performs policy checks before a tool runs; this is the
 * second line of defence that keeps file access inside the sandbox.
 */
export function resolveWithin(
  workspaceRoot: string,
  relativePath: string,
): string {
  const root = path.resolve(workspaceRoot);
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error(`Path escapes workspace: ${relativePath}`);
  }
  return abs;
}

export function toRelative(workspaceRoot: string, abs: string): string {
  return path.relative(path.resolve(workspaceRoot), abs).split(path.sep).join("/");
}
