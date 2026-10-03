import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ToolContext } from "@ai-dev-team/types";
import { createCoreTools } from "../src/index";

let workspace: string;
let ctx: ToolContext;
const tools = createCoreTools();
const tool = (name: string) => {
  const t = tools.find((t) => t.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
};

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "tools-test-"));
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await writeFile(path.join(workspace, "src/a.ts"), "const a = 1;\nexport { a };\n");
  await writeFile(path.join(workspace, "src/b.ts"), "export const b = 2;\n");
  await mkdir(path.join(workspace, "node_modules/x"), { recursive: true });
  await writeFile(path.join(workspace, "node_modules/x/index.js"), "x");
  ctx = { workspaceRoot: workspace };
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe("read_file", () => {
  it("reads file content", async () => {
    const out = (await tool("read_file").execute({ path: "src/a.ts" }, ctx)) as {
      content: string;
    };
    expect(out.content).toContain("const a = 1");
  });
});

describe("write_file + edit_file", () => {
  it("creates files with parent directories", async () => {
    await tool("write_file").execute(
      { path: "new/deep/c.ts", content: "export const c = 3;\n" },
      ctx,
    );
    const written = await readFile(path.join(workspace, "new/deep/c.ts"), "utf8");
    expect(written).toContain("c = 3");
  });

  it("replaces unique text", async () => {
    const out = (await tool("edit_file").execute(
      { path: "src/a.ts", old_string: "const a = 1", new_string: "const a = 42" },
      ctx,
    )) as { replacements: number };
    expect(out.replacements).toBe(1);
    expect(await readFile(path.join(workspace, "src/a.ts"), "utf8")).toContain(
      "a = 42",
    );
  });

  it("fails on missing or ambiguous old_string", async () => {
    await writeFile(path.join(workspace, "dup.txt"), "x\nx\n");
    await expect(
      tool("edit_file").execute(
        { path: "dup.txt", old_string: "x", new_string: "y" },
        ctx,
      ),
    ).rejects.toThrow(/2 times/);
    await expect(
      tool("edit_file").execute(
        { path: "src/a.ts", old_string: "nope", new_string: "y" },
        ctx,
      ),
    ).rejects.toThrow(/not found/);
  });

  it("replace_all replaces every occurrence", async () => {
    await writeFile(path.join(workspace, "dup.txt"), "x\nx\n");
    await tool("edit_file").execute(
      { path: "dup.txt", old_string: "x", new_string: "y", replace_all: true },
      ctx,
    );
    expect(await readFile(path.join(workspace, "dup.txt"), "utf8")).toBe("y\ny\n");
  });
});

describe("list_files", () => {
  it("lists files skipping node_modules", async () => {
    const out = (await tool("list_files").execute({}, ctx)) as {
      files: string[];
    };
    expect(out.files).toContain("src/a.ts");
    expect(out.files).toContain("src/b.ts");
    expect(out.files.some((f) => f.includes("node_modules"))).toBe(false);
  });

  it("filters by glob", async () => {
    const out = (await tool("list_files").execute({ pattern: "**/a.ts" }, ctx)) as {
      files: string[];
    };
    expect(out.files).toEqual(["src/a.ts"]);
  });
});

describe("search_code", () => {
  it("finds substring matches with line numbers", async () => {
    const out = (await tool("search_code").execute(
      { query: "export const b" },
      ctx,
    )) as { matches: { path: string; line: number }[] };
    expect(out.matches).toEqual([
      { path: "src/b.ts", line: 1, text: "export const b = 2;" },
    ]);
  });

  it("supports regex", async () => {
    const out = (await tool("search_code").execute(
      { query: "const [ab] =", regex: true },
      ctx,
    )) as { matches: { path: string }[] };
    expect(out.matches.map((m) => m.path).sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });
});
