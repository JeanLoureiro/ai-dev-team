import { randomUUID } from "node:crypto";
import type {
  AgentEvent,
  AgentRun,
  Approval,
  Repository,
} from "@ai-dev-team/types";
import type {
  AgentOutput,
  NewRepository,
  OutputKind,
  RunPatch,
  RunStore,
  StoredPullRequest,
} from "./store";

/**
 * In-memory store: default backend when Supabase is not configured, and
 * the fixture for tests. Events accumulate per run in append order.
 */
export class InMemoryRunStore implements RunStore {
  readonly repositories = new Map<string, Repository>();
  readonly runs = new Map<string, AgentRun>();
  readonly events: AgentEvent[] = [];
  readonly outputs: AgentOutput[] = [];
  readonly approvals: Approval[] = [];
  readonly pullRequests: StoredPullRequest[] = [];

  async upsertRepository(input: NewRepository): Promise<Repository> {
    const fullName = `${input.owner}/${input.name}`;
    const existing = [...this.repositories.values()].find(
      (r) => r.fullName === fullName,
    );
    if (existing) return existing;
    const repo: Repository = {
      id: randomUUID(),
      owner: input.owner,
      name: input.name,
      fullName,
      defaultBranch: input.defaultBranch ?? "main",
      ...(input.installationId !== undefined
        ? { installationId: input.installationId }
        : {}),
    };
    this.repositories.set(repo.id, repo);
    return repo;
  }

  async getRepository(id: string): Promise<Repository | undefined> {
    return this.repositories.get(id);
  }

  async listRepositories(): Promise<Repository[]> {
    return [...this.repositories.values()];
  }

  async createRun(input: {
    repositoryId: string;
    issueNumber: number;
    branchName?: string;
    workspacePath?: string;
    testCommands?: string[];
  }): Promise<AgentRun> {
    const run: AgentRun = {
      id: randomUUID(),
      repositoryId: input.repositoryId,
      issueNumber: input.issueNumber,
      status: "pending",
      startedAt: new Date(),
      iterationCount: 0,
      coderIterations: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      ...(input.branchName ? { branchName: input.branchName } : {}),
      ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      ...(input.testCommands ? { testCommands: input.testCommands } : {}),
    };
    this.runs.set(run.id, run);
    return run;
  }

  async getRun(id: string): Promise<AgentRun | undefined> {
    return this.runs.get(id);
  }

  async updateRun(id: string, patch: RunPatch): Promise<AgentRun> {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    const next: AgentRun = { ...run };
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.currentAgent === null) delete next.currentAgent;
    else if (patch.currentAgent !== undefined) next.currentAgent = patch.currentAgent;
    if (patch.iterationCount !== undefined) next.iterationCount = patch.iterationCount;
    if (patch.coderIterations !== undefined) next.coderIterations = patch.coderIterations;
    if (patch.tokenUsage !== undefined) next.tokenUsage = patch.tokenUsage;
    if (patch.branchName !== undefined) next.branchName = patch.branchName;
    if (patch.workspacePath !== undefined) next.workspacePath = patch.workspacePath;
    if (patch.pullRequestNumber !== undefined)
      next.pullRequestNumber = patch.pullRequestNumber;
    if (patch.completedAt !== undefined) next.completedAt = patch.completedAt;
    if (patch.error !== undefined) next.error = patch.error;
    this.runs.set(id, next);
    return next;
  }

  async listRuns(limit = 50): Promise<AgentRun[]> {
    return [...this.runs.values()]
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  async appendEvent(event: AgentEvent): Promise<void> {
    this.events.push(event);
  }

  async listEvents(runId: string): Promise<AgentEvent[]> {
    return this.events
      .filter((e) => e.runId === runId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  async saveOutput(input: {
    runId: string;
    agent?: AgentRun["currentAgent"];
    kind: OutputKind;
    data: unknown;
  }): Promise<AgentOutput> {
    const output: AgentOutput = {
      id: randomUUID(),
      runId: input.runId,
      kind: input.kind,
      data: input.data,
      createdAt: new Date(),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
    };
    this.outputs.push(output);
    return output;
  }

  async listOutputs(runId: string): Promise<AgentOutput[]> {
    return this.outputs.filter((o) => o.runId === runId);
  }

  async getOutput(
    runId: string,
    kind: OutputKind,
  ): Promise<AgentOutput | undefined> {
    return this.outputs.find((o) => o.runId === runId && o.kind === kind);
  }

  async recordApproval(input: {
    runId: string;
    decision: Approval["decision"];
    reviewer?: string;
    comment?: string;
  }): Promise<Approval> {
    const approval: Approval = {
      id: randomUUID(),
      runId: input.runId,
      decision: input.decision,
      createdAt: new Date(),
      ...(input.reviewer !== undefined ? { reviewer: input.reviewer } : {}),
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    };
    this.approvals.push(approval);
    return approval;
  }

  async getLatestApproval(runId: string): Promise<Approval | undefined> {
    return this.approvals
      .filter((a) => a.runId === runId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  async savePullRequest(input: {
    runId: string;
    repositoryId: string;
    number: number;
    url: string;
    branch: string;
  }): Promise<StoredPullRequest> {
    const pr: StoredPullRequest = {
      id: randomUUID(),
      createdAt: new Date(),
      ...input,
    };
    this.pullRequests.push(pr);
    return pr;
  }
}
