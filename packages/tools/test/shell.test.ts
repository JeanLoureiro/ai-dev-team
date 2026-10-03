import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandResult } from "../src/shell";
import { commandEnv, splitCommand } from "../src/shell";
import { createShellTools } from "../src/shell";

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "shell-test-"));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

const runCommand = createShellTools()[0]!;

describe("splitCommand", () => {
  it("splits on whitespace", () => {
    expect(splitCommand("npm test")).toEqual(["npm", "test"]);
    expect(splitCommand("npm  run   lint")).toEqual(["npm", "run", "lint"]);
  });

  it("respects quotes", () => {
    expect(splitCommand(`echo "a b" 'c d'`)).toEqual(["echo", "a b", "c d"]);
    expect(splitCommand(`git commit -m "fix: thing"`)).toEqual([
      "git",
      "commit",
      "-m",
      "fix: thing",
    ]);
  });

  it("handles escapes", () => {
    expect(splitCommand(String.raw`echo a\ b`)).toEqual(["echo", "a b"]);
  });

  it("rejects unclosed quotes", () => {
    expect(() => splitCommand(`echo "oops`)).toThrow(/Unclosed quote/);
  });
});

describe("run_command tool", () => {
  it("executes commands and captures output", async () => {
    const out = (await runCommand.execute(
      { command: "echo hello" },
      { workspaceRoot: workspace },
    )) as CommandResult;
    expect(out.exitCode).toBe(0);
    expect(out.stdout.trim()).toBe("hello");
  });

  it("reports non-zero exit codes", async () => {
    const out = (await runCommand.execute(
      { command: "ls does-not-exist-dir" },
      { workspaceRoot: workspace },
    )) as CommandResult;
    expect(out.exitCode).not.toBe(0);
    expect(out.stderr.length).toBeGreaterThan(0);
  });

  it("treats shell metacharacters as literal argv (no shell)", async () => {
    await writeFile(path.join(workspace, "marker.txt"), "x");
    const out = (await runCommand.execute(
      { command: "echo hi && rm marker.txt" },
      { workspaceRoot: workspace },
    )) as CommandResult;
    expect(out.stdout.trim()).toBe("hi && rm marker.txt");
    const { access } = await import("node:fs/promises");
    await expect(access(path.join(workspace, "marker.txt"))).resolves.toBeUndefined();
  });

  it("runs in the workspace directory", async () => {
    const out = (await runCommand.execute(
      { command: "pwd" },
      { workspaceRoot: workspace },
    )) as CommandResult;
    // macOS /tmp is a symlink to /private/tmp
    expect(out.stdout.trim()).toBe(await realpath(workspace));
  });
});

describe("commandEnv", () => {
  it("does not leak host secrets", () => {
    const env = commandEnv();
    for (const key of Object.keys(env)) {
      expect(key).not.toMatch(/KEY|TOKEN|SECRET/i);
    }
    expect(env.PATH).toBeDefined();
  });
});
