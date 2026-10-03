import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentEventType, AgentType } from "@ai-dev-team/types";
import { InMemoryRunStore } from "../src/memory";

function ev(
  runId: string,
  type: AgentEventType,
  agent?: AgentType,
): AgentEvent {
  return {
    id: randomUUID(),
    runId,
    type,
    timestamp: new Date(),
    ...(agent ? { agent } : {}),
  };
}

describe("InMemoryRunStore", () => {
  it("round-trips repositories by unique full name", async () => {
    const store = new InMemoryRunStore();
    const a = await store.upsertRepository({ owner: "o", name: "r" });
    const b = await store.upsertRepository({ owner: "o", name: "r" });
    expect(a.id).toBe(b.id);
    expect(a.fullName).toBe("o/r");
    expect(a.defaultBranch).toBe("main");
  });

  it("creates runs and applies patches", async () => {
    const store = new InMemoryRunStore();
    const repo = await store.upsertRepository({ owner: "o", name: "r" });
    const run = await store.createRun({
      repositoryId: repo.id,
      issueNumber: 7,
    });
    expect(run.status).toBe("pending");
    expect(run.tokenUsage.inputTokens).toBe(0);

    const updated = await store.updateRun(run.id, {
      status: "planning",
      currentAgent: "planner",
      iterationCount: 3,
    });
    expect(updated.status).toBe("planning");
    expect(updated.currentAgent).toBe("planner");
    expect(updated.iterationCount).toBe(3);

    const cleared = await store.updateRun(run.id, { currentAgent: null });
    expect(cleared.currentAgent).toBeUndefined();
  });

  it("appends and lists events in order", async () => {
    const store = new InMemoryRunStore();
    const repo = await store.upsertRepository({ owner: "o", name: "r" });
    const run = await store.createRun({ repositoryId: repo.id, issueNumber: 1 });
    await store.appendEvent(ev(run.id, "run.created"));
    await store.appendEvent(ev(run.id, "agent.started", "planner"));
    const events = await store.listEvents(run.id);
    expect(events.map((e) => e.type)).toEqual(["run.created", "agent.started"]);
  });

  it("stores outputs and approvals", async () => {
    const store = new InMemoryRunStore();
    const repo = await store.upsertRepository({ owner: "o", name: "r" });
    const run = await store.createRun({ repositoryId: repo.id, issueNumber: 1 });
    await store.saveOutput({
      runId: run.id,
      agent: "planner",
      kind: "plan",
      data: { summary: "s" },
    });
    const plan = await store.getOutput(run.id, "plan");
    expect(plan?.data).toEqual({ summary: "s" });

    await store.recordApproval({ runId: run.id, decision: "approved" });
    const approval = await store.getLatestApproval(run.id);
    expect(approval?.decision).toBe("approved");
  });
});
