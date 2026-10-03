import type {
  AgentEvent,
  AgentRun,
  AgentType,
  Approval,
  ApprovalDecision,
  Repository,
  RunStatus,
} from "@ai-dev-team/types";

/** Kinds of structured artifacts persisted under agent_outputs. */
export type OutputKind =
  | "plan"
  | "coding_result"
  | "test_result"
  | "review_result"
  | "pr_summary";

export type AgentOutput = {
  id: string;
  runId: string;
  agent?: AgentType;
  kind: OutputKind;
  data: unknown;
  createdAt: Date;
};

export type StoredPullRequest = {
  id: string;
  runId: string;
  repositoryId: string;
  number: number;
  url: string;
  branch: string;
  createdAt: Date;
};

export type NewRepository = {
  owner: string;
  name: string;
  defaultBranch?: string;
  installationId?: number;
};

export type RunPatch = {
  status?: RunStatus;
  currentAgent?: AgentType | null;
  iterationCount?: number;
  coderIterations?: number;
  tokenUsage?: AgentRun["tokenUsage"];
  branchName?: string;
  workspacePath?: string;
  pullRequestNumber?: number;
  completedAt?: Date;
  error?: AgentRun["error"];
};

/**
 * Persistence boundary (docs/architecture.md section 17). The event log
 * is append-only; run state is updated in place.
 */
export interface RunStore {
  upsertRepository(input: NewRepository): Promise<Repository>;
  getRepository(id: string): Promise<Repository | undefined>;
  listRepositories(): Promise<Repository[]>;

  createRun(input: {
    repositoryId: string;
    issueNumber: number;
    branchName?: string;
    workspacePath?: string;
    testCommands?: string[];
  }): Promise<AgentRun>;
  getRun(id: string): Promise<AgentRun | undefined>;
  updateRun(id: string, patch: RunPatch): Promise<AgentRun>;
  listRuns(limit?: number): Promise<AgentRun[]>;

  appendEvent(event: AgentEvent): Promise<void>;
  listEvents(runId: string): Promise<AgentEvent[]>;

  saveOutput(input: {
    runId: string;
    agent?: AgentType;
    kind: OutputKind;
    data: unknown;
  }): Promise<AgentOutput>;
  listOutputs(runId: string): Promise<AgentOutput[]>;
  getOutput(runId: string, kind: OutputKind): Promise<AgentOutput | undefined>;

  recordApproval(input: {
    runId: string;
    decision: ApprovalDecision;
    reviewer?: string;
    comment?: string;
  }): Promise<Approval>;
  getLatestApproval(runId: string): Promise<Approval | undefined>;

  savePullRequest(input: {
    runId: string;
    repositoryId: string;
    number: number;
    url: string;
    branch: string;
  }): Promise<StoredPullRequest>;
}
