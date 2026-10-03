import { randomUUID } from "node:crypto";
import type {
  AgentEvent,
  AgentEventType,
  AgentType,
} from "@ai-dev-team/types";

/**
 * Every agent action produces an immutable event (docs/architecture.md
 * sections 5.4 and 16). The sink is where observability plugs in: the
 * Supabase-backed store persists events, tests collect them in memory.
 */
export interface EventSink {
  emit(event: AgentEvent): Promise<void> | void;
}

export type EmitInput = {
  runId: string;
  type: AgentEventType;
  agent?: AgentType;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
};

export function createEvent(input: EmitInput): AgentEvent {
  const event: AgentEvent = {
    id: randomUUID(),
    runId: input.runId,
    type: input.type,
    timestamp: new Date(),
  };
  if (input.agent !== undefined) event.agent = input.agent;
  if (input.input !== undefined) event.input = input.input;
  if (input.output !== undefined) event.output = input.output;
  if (input.metadata !== undefined) event.metadata = input.metadata;
  return event;
}

export async function emitEvent(
  sink: EventSink,
  input: EmitInput,
): Promise<AgentEvent> {
  const event = createEvent(input);
  await sink.emit(event);
  return event;
}

/** Collects events in memory. Useful for tests and as a dev backend. */
export class InMemoryEventSink implements EventSink {
  readonly events: AgentEvent[] = [];

  emit(event: AgentEvent): void {
    this.events.push(event);
  }
}
