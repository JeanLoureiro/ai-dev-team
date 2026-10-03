import type { AgentType } from "./agent";
import type { RunStatus } from "./run";

/**
 * Event types produced during a run (docs/architecture.md sections 5.4
 * and 16). The event log is append-only and is the primary source of
 * observability for debugging, UI timelines and evaluation.
 */
export const AGENT_EVENT_TYPES = [
  "run.created",
  "run.status_changed",
  "run.completed",
  "run.failed",
  "run.limit_exceeded",

  "agent.started",
  "agent.completed",
  "agent.failed",
  "agent.output_received",

  "tool.requested",
  "tool.completed",
  "tool.denied",

  "test.started",
  "test.completed",

  "plan.ready",
  "code.ready",
  "review.completed",

  "approval.requested",
  "approval.granted",
  "approval.rejected",
  "approval.changes_requested",

  "pull_request.created",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export type AgentEvent = {
  id: string;
  runId: string;

  type: AgentEventType;

  agent?: AgentType;

  timestamp: Date;

  input?: unknown;
  output?: unknown;

  metadata?: Record<string, unknown>;
};

/** Payload carried by `run.status_changed` events. */
export type StatusChangePayload = {
  from: RunStatus;
  to: RunStatus;
};
