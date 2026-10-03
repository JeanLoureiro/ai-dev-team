import type { AgentTool } from "@ai-dev-team/types";
import { createFileSystemTools } from "./filesystem";
import { createGitTools } from "./git";
import { createShellTools } from "./shell";

/**
 * The initial tool set (docs/architecture.md section 11):
 * read_file, search_code, list_files, write_file, edit_file,
 * run_command, git_diff.
 */
export function createCoreTools(): AgentTool[] {
  return [
    ...createFileSystemTools(),
    ...createShellTools(),
    ...createGitTools(),
  ];
}

export { splitCommand, runCommand, type CommandResult } from "./shell";
export { resolveWithin, toRelative } from "./paths";
