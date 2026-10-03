import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentEvent,
  AgentRun,
  AgentType,
  Approval,
  Repository,
  RunError,
  RunStatus,
  TokenUsage,
} from "@ai-dev-team/types";
import type {
  AgentOutput,
  NewRepository,
  OutputKind,
  RunPatch,
  RunStore,
  StoredPullRequest,
} from "./store";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function dateOrUndefined(value: unknown): Date | undefined {
  return typeof value === "string" ? new Date(value) : undefined;
}

function rowToRepository(row: Row): Repository {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    fullName: row.full_name,
    defaultBranch: row.default_branch,
    ...(row.installation_id != null
      ? { installationId: row.installation_id }
      : {}),
  };
}

function rowToRun(row: Row): AgentRun {
  const tokenUsage: TokenUsage = {
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
  };
  const run: AgentRun = {
    id: row.id,
    repositoryId: row.repository_id,
    issueNumber: row.issue_number,
    status: row.status as RunStatus,
    startedAt: new Date(row.started_at),
    iterationCount: row.iteration_count ?? 0,
    coderIterations: row.coder_iterations ?? 0,
    tokenUsage,
  };
  const completedAt = dateOrUndefined(row.completed_at);
  if (completedAt) run.completedAt = completedAt;
  if (row.current_agent) run.currentAgent = row.current_agent as AgentType;
  if (row.branch_name) run.branchName = row.branch_name;
  if (row.workspace_path) run.workspacePath = row.workspace_path;
  if (Array.isArray(row.test_commands)) run.testCommands = row.test_commands;
  if (row.pull_request_number != null)
    run.pullRequestNumber = row.pull_request_number;
  if (row.error) run.error = row.error as RunError;
  return run;
}

function rowToEvent(row: Row): AgentEvent {
  const event: AgentEvent = {
    id: row.id,
    runId: row.run_id,
    type: row.type,
    timestamp: new Date(row.created_at),
  };
  if (row.agent) event.agent = row.agent as AgentType;
  if (row.input !== null && row.input !== undefined) event.input = row.input;
  if (row.output !== null && row.output !== undefined) event.output = row.output;
  if (row.metadata !== null && row.metadata !== undefined)
    event.metadata = row.metadata as Record<string, unknown>;
  return event;
}

function rowToOutput(row: Row): AgentOutput {
  const output: AgentOutput = {
    id: row.id,
    runId: row.run_id,
    kind: row.kind as OutputKind,
    data: row.data,
    createdAt: new Date(row.created_at),
  };
  if (row.agent) output.agent = row.agent as AgentType;
  return output;
}

function rowToApproval(row: Row): Approval {
  const approval: Approval = {
    id: row.id,
    runId: row.run_id,
    decision: row.decision,
    createdAt: new Date(row.created_at),
  };
  if (row.reviewer) approval.reviewer = row.reviewer;
  if (row.comment) approval.comment = row.comment;
  return approval;
}

function rowToPullRequest(row: Row): StoredPullRequest {
  return {
    id: row.id,
    runId: row.run_id,
    repositoryId: row.repository_id,
    number: row.number,
    url: row.url,
    branch: row.branch,
    createdAt: new Date(row.created_at),
  };
}

function runPatchToRow(patch: RunPatch): Row {
  const row: Row = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.currentAgent !== undefined) row.current_agent = patch.currentAgent;
  if (patch.iterationCount !== undefined)
    row.iteration_count = patch.iterationCount;
  if (patch.coderIterations !== undefined)
    row.coder_iterations = patch.coderIterations;
  if (patch.tokenUsage !== undefined) {
    row.input_tokens = patch.tokenUsage.inputTokens;
    row.output_tokens = patch.tokenUsage.outputTokens;
    row.estimated_cost_usd = patch.tokenUsage.estimatedCostUsd;
  }
  if (patch.branchName !== undefined) row.branch_name = patch.branchName;
  if (patch.workspacePath !== undefined) row.workspace_path = patch.workspacePath;
  if (patch.pullRequestNumber !== undefined)
    row.pull_request_number = patch.pullRequestNumber;
  if (patch.completedAt !== undefined)
    row.completed_at = patch.completedAt.toISOString();
  if (patch.error !== undefined) row.error = patch.error;
  return row;
}

/**
 * Supabase/PostgreSQL-backed store. The service role key is required and
 * must only be used server-side; RLS keeps anon access closed.
 */
export class SupabaseRunStore implements RunStore {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  private async unwrap<T>(
    query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  ): Promise<T> {
    const { data, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (data === null) throw new Error("Supabase returned no data");
    return data;
  }

  async upsertRepository(input: NewRepository): Promise<Repository> {
    const fullName = `${input.owner}/${input.name}`;
    const row = await this.unwrap<Row>(
      this.db
        .from("repositories")
        .upsert(
          {
            owner: input.owner,
            name: input.name,
            full_name: fullName,
            default_branch: input.defaultBranch ?? "main",
            installation_id: input.installationId ?? null,
          },
          { onConflict: "full_name" },
        )
        .select()
        .single(),
    );
    return rowToRepository(row);
  }

  async getRepository(id: string): Promise<Repository | undefined> {
    const { data, error } = await this.db
      .from("repositories")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data ? rowToRepository(data) : undefined;
  }

  async listRepositories(): Promise<Repository[]> {
    const rows = await this.unwrap<Row[]>(this.db.from("repositories").select());
    return rows.map(rowToRepository);
  }

  async createRun(input: {
    repositoryId: string;
    issueNumber: number;
    branchName?: string;
    workspacePath?: string;
    testCommands?: string[];
  }): Promise<AgentRun> {
    const row = await this.unwrap<Row>(
      this.db
        .from("agent_runs")
        .insert({
          repository_id: input.repositoryId,
          issue_number: input.issueNumber,
          status: "pending",
          branch_name: input.branchName ?? null,
          workspace_path: input.workspacePath ?? null,
          test_commands: input.testCommands ?? null,
        })
        .select()
        .single(),
    );
    return rowToRun(row);
  }

  async getRun(id: string): Promise<AgentRun | undefined> {
    const { data, error } = await this.db
      .from("agent_runs")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data ? rowToRun(data) : undefined;
  }

  async updateRun(id: string, patch: RunPatch): Promise<AgentRun> {
    const row = await this.unwrap<Row>(
      this.db
        .from("agent_runs")
        .update(runPatchToRow(patch))
        .eq("id", id)
        .select()
        .single(),
    );
    return rowToRun(row);
  }

  async listRuns(limit = 50): Promise<AgentRun[]> {
    const rows = await this.unwrap<Row[]>(
      this.db
        .from("agent_runs")
        .select()
        .order("started_at", { ascending: false })
        .limit(limit),
    );
    return rows.map(rowToRun);
  }

  async appendEvent(event: AgentEvent): Promise<void> {
    await this.unwrap<Row>(
      this.db
        .from("agent_events")
        .insert({
          id: event.id,
          run_id: event.runId,
          type: event.type,
          agent: event.agent ?? null,
          input: event.input ?? null,
          output: event.output ?? null,
          metadata: event.metadata ?? null,
          created_at: event.timestamp.toISOString(),
        })
        .select()
        .single(),
    );
  }

  async listEvents(runId: string): Promise<AgentEvent[]> {
    const rows = await this.unwrap<Row[]>(
      this.db
        .from("agent_events")
        .select()
        .eq("run_id", runId)
        .order("created_at", { ascending: true }),
    );
    return rows.map(rowToEvent);
  }

  async saveOutput(input: {
    runId: string;
    agent?: AgentType;
    kind: OutputKind;
    data: unknown;
  }): Promise<AgentOutput> {
    const row = await this.unwrap<Row>(
      this.db
        .from("agent_outputs")
        .insert({
          run_id: input.runId,
          agent: input.agent ?? null,
          kind: input.kind,
          data: input.data,
        })
        .select()
        .single(),
    );
    return rowToOutput(row);
  }

  async listOutputs(runId: string): Promise<AgentOutput[]> {
    const rows = await this.unwrap<Row[]>(
      this.db.from("agent_outputs").select().eq("run_id", runId),
    );
    return rows.map(rowToOutput);
  }

  async getOutput(
    runId: string,
    kind: OutputKind,
  ): Promise<AgentOutput | undefined> {
    const { data, error } = await this.db
      .from("agent_outputs")
      .select()
      .eq("run_id", runId)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data ? rowToOutput(data) : undefined;
  }

  async recordApproval(input: {
    runId: string;
    decision: Approval["decision"];
    reviewer?: string;
    comment?: string;
  }): Promise<Approval> {
    const row = await this.unwrap<Row>(
      this.db
        .from("approvals")
        .insert({
          run_id: input.runId,
          decision: input.decision,
          reviewer: input.reviewer ?? null,
          comment: input.comment ?? null,
        })
        .select()
        .single(),
    );
    return rowToApproval(row);
  }

  async getLatestApproval(runId: string): Promise<Approval | undefined> {
    const { data, error } = await this.db
      .from("approvals")
      .select()
      .eq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return data ? rowToApproval(data) : undefined;
  }

  async savePullRequest(input: {
    runId: string;
    repositoryId: string;
    number: number;
    url: string;
    branch: string;
  }): Promise<StoredPullRequest> {
    const row = await this.unwrap<Row>(
      this.db
        .from("pull_requests")
        .insert({
          run_id: input.runId,
          repository_id: input.repositoryId,
          number: input.number,
          url: input.url,
          branch: input.branch,
        })
        .select()
        .single(),
    );
    return rowToPullRequest(row);
  }
}
