import type { RunStatus } from "@ai-dev-team/types";
import { HarnessError } from "./errors";

/**
 * Explicit run state machine (docs/architecture.md section 13).
 *
 * testing -> coding is the bounded retry loop back to the Coder.
 * awaiting_approval -> coding covers "request changes".
 * approved -> pr_created is the only path to a pull request.
 */
export const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  pending: ["planning", "failed"],
  planning: ["plan_ready", "failed"],
  plan_ready: ["coding", "failed"],
  coding: ["code_ready", "failed"],
  code_ready: ["testing", "failed"],
  testing: ["reviewing", "coding", "failed"],
  reviewing: ["review_complete", "failed"],
  review_complete: ["awaiting_approval", "failed"],
  awaiting_approval: ["approved", "rejected", "coding", "failed"],
  approved: ["pr_created", "failed"],
  rejected: [],
  pr_created: [],
  failed: [],
};

export const TERMINAL_STATUSES: readonly RunStatus[] = [
  "rejected",
  "pr_created",
  "failed",
];

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new HarnessError(
      "INVALID_AGENT_OUTPUT",
      `Invalid run transition: ${from} -> ${to}`,
    );
  }
}

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
