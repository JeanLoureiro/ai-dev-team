import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import type { AgentTool } from "@ai-dev-team/types";
import { resolveWithin, toRelative } from "./paths";

const MAX_FILE_BYTES = 100 * 1024;
const MAX_LISTED_FILES = 2_000;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  ".turbo",
  "coverage",
]);

async function walk(
  root: string,
  dir: string,
  out: string[],
  limit: number,
): Promise<void> {
  if (out.length >= limit) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= limit) return;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(root, abs, out, limit);
    } else if (entry.isFile()) {
      out.push(toRelative(root, abs));
    }
  }
}

export function createFileSystemTools(): AgentTool[] {
  const readFileTool: AgentTool = {
    name: "read_file",
    description:
      "Read a workspace file. Returns the UTF-8 content, truncated beyond 100KB.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative file path" },
      },
      required: ["path"],
    },
    pathInputs: ["path"],
    execute: async (input, ctx) => {
      const { path: rel } = input as { path: string };
      const abs = resolveWithin(ctx.workspaceRoot, rel);
      const buf = await readFile(abs);
      const truncated = buf.byteLength > MAX_FILE_BYTES;
      const content = buf.subarray(0, MAX_FILE_BYTES).toString("utf8");
      return { path: rel, content, truncated, sizeBytes: buf.byteLength };
    },
  };

  const listFilesTool: AgentTool = {
    name: "list_files",
    description:
      "List workspace files. Skips node_modules, .git, build output. Optional glob filter.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Subdirectory to list (default: workspace root)",
        },
        pattern: {
          type: "string",
          description: "Glob filter, e.g. '**/*.ts'",
        },
      },
    },
    pathInputs: ["path"],
    execute: async (input, ctx) => {
      const { path: rel = ".", pattern } = input as {
        path?: string;
        pattern?: string;
      };
      const abs = resolveWithin(ctx.workspaceRoot, rel);
      const files: string[] = [];
      await walk(ctx.workspaceRoot, abs, files, MAX_LISTED_FILES);
      const filtered = pattern
        ? files.filter((f) => picomatch(pattern, { dot: true })(f))
        : files;
      return { files: filtered.sort(), truncated: files.length >= MAX_LISTED_FILES };
    },
  };

  const writeFileTool: AgentTool = {
    name: "write_file",
    description:
      "Write a file in the workspace, creating parent directories. Overwrites existing content.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    pathInputs: ["path"],
    execute: async (input, ctx) => {
      const { path: rel, content } = input as { path: string; content: string };
      const abs = resolveWithin(ctx.workspaceRoot, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
      return { path: rel, bytes: Buffer.byteLength(content) };
    },
  };

  const editFileTool: AgentTool = {
    name: "edit_file",
    description:
      "Replace exact text in a workspace file. Fails when old_string is absent, or appears more than once without replace_all.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_string: { type: "string" },
        new_string: { type: "string" },
        replace_all: { type: "boolean" },
      },
      required: ["path", "old_string", "new_string"],
    },
    pathInputs: ["path"],
    execute: async (input, ctx) => {
      const { path: rel, old_string, new_string, replace_all } = input as {
        path: string;
        old_string: string;
        new_string: string;
        replace_all?: boolean;
      };
      if (old_string === "") throw new Error("old_string must not be empty");
      const abs = resolveWithin(ctx.workspaceRoot, rel);
      const content = await readFile(abs, "utf8");
      const occurrences = content.split(old_string).length - 1;
      if (occurrences === 0) {
        throw new Error(`old_string not found in ${rel}`);
      }
      if (occurrences > 1 && !replace_all) {
        throw new Error(
          `old_string appears ${occurrences} times in ${rel}; set replace_all or provide more context`,
        );
      }
      const next = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);
      await writeFile(abs, next, "utf8");
      return { path: rel, replacements: replace_all ? occurrences : 1 };
    },
  };

  const searchCodeTool: AgentTool = {
    name: "search_code",
    description:
      "Search workspace files for a substring or regex. Returns matching lines with file and line number.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Substring or regex pattern" },
        regex: { type: "boolean", description: "Treat query as a regex" },
        path: { type: "string", description: "Restrict to a subdirectory" },
        caseSensitive: { type: "boolean" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
    pathInputs: ["path"],
    execute: async (input, ctx) => {
      const {
        query,
        regex = false,
        path: rel = ".",
        caseSensitive = false,
        maxResults = 100,
      } = input as {
        query: string;
        regex?: boolean;
        path?: string;
        caseSensitive?: boolean;
        maxResults?: number;
      };
      const matcher = regex
        ? new RegExp(query, caseSensitive ? "" : "i")
        : null;
      const needle = caseSensitive ? query : query.toLowerCase();

      const abs = resolveWithin(ctx.workspaceRoot, rel);
      const files: string[] = [];
      await walk(ctx.workspaceRoot, abs, files, MAX_LISTED_FILES);

      const matches: { path: string; line: number; text: string }[] = [];
      for (const file of files) {
        if (matches.length >= maxResults) break;
        const content = await readFile(
          resolveWithin(ctx.workspaceRoot, file),
          "utf8",
        );
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          const text = lines[i]!;
          const hit = matcher
            ? matcher.test(text)
            : (caseSensitive ? text : text.toLowerCase()).includes(needle);
          if (hit) {
            matches.push({ path: file, line: i + 1, text: text.slice(0, 500) });
          }
        }
      }
      return { matches, truncated: matches.length >= maxResults };
    },
  };

  return [readFileTool, listFilesTool, writeFileTool, editFileTool, searchCodeTool];
}
