import { describe, expect, it } from "vitest";
import { RUN_STATUSES, type RunStatus } from "@ai-dev-team/types";
import {
  assertTransition,
  canTransition,
  isTerminal,
  RUN_TRANSITIONS,
} from "../src/state-machine";
import { isHarnessError } from "../src/errors";

describe("run state machine", () => {
  it("covers every status in the transition table", () => {
    for (const status of RUN_STATUSES) {
      expect(RUN_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("follows the happy path issue -> pr_created", () => {
    const path: RunStatus[] = [
      "pending",
      "planning",
      "plan_ready",
      "coding",
      "code_ready",
      "testing",
      "reviewing",
      "review_complete",
      "awaiting_approval",
      "approved",
      "pr_created",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it("supports the tester -> coder retry loop", () => {
    expect(canTransition("testing", "coding")).toBe(true);
    expect(canTransition("coding", "code_ready")).toBe(true);
  });

  it("supports rejection and changes-requested", () => {
    expect(canTransition("awaiting_approval", "rejected")).toBe(true);
    expect(canTransition("awaiting_approval", "coding")).toBe(true);
  });

  it("rejects impossible transitions", () => {
    for (const [from, to] of [
      ["pending", "pr_created"],
      ["planning", "awaiting_approval"],
      ["rejected", "coding"],
      ["pr_created", "pending"],
      ["failed", "pending"],
    ] as const) {
      expect(canTransition(from, to)).toBe(false);
      try {
        assertTransition(from, to);
        throw new Error("unreachable");
      } catch (error) {
        expect(isHarnessError(error)).toBe(true);
      }
    }
  });

  it("marks terminal states", () => {
    expect(isTerminal("pr_created")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("coding")).toBe(false);
  });
});
