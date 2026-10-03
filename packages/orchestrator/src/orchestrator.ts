import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  AgentHarness,
  assertTransition,
  describeError,
  emitEvent,
  evaluateLimits,
  HarnessError,
  isHarnessError,
  ToolRegistry,
  type EventSink,
} from "@ai-dev-team/harness";
import {
  coderPolicy,
  plannerPolicy,
  reviewerPolicy,
  runCoder,
  runPlanner,
  runReviewer,
  runTester,
  testerPolicy,
  type AgentDeps,
  type AgentInvocation,
} from "@ai-dev-team/agents";
import { createCoreTools, resolveWithin } from "@ai-dev-team/tools";
import type { GitHubClient } from "@ai-dev-team/github";
import { estimateCostUsd, type LlmProvider } from "@ai-dev-team/llm";
import type { RunStore } from "@ai-dev-team/store";
import {
  codingResultSchema,
  DEFAULT_RUN_LIMITS,
  reviewResultSchema,
  type AgentRun,
  type AgentType,
  type ApprovalDecision,
  type CodingResult,
  type FailureCategory,
  type GitHubIssue,
  type ImplementationPlan,
  type Repository,
  type RepositoryContext,
  type ReviewResult,
  type RunLimits,
  type RunStatus,
  type TestResult,
  type ToolPolicy,
  type TokenUsage,
} from "@ai-dev-team/types";
import {
  detectTestCommands,
  listTrackedFiles,
  workspacePathFor,
} from "./context";

export type StartRunInput = {
  owner: string;
  repo: string;
  issueNumber: number;
  defaultBranch?: string | undefined;
  /** Absolute path of the local checkout; defaults to <workspacesRoot>/<owner>__<repo>. */
  workspacePath?: string | undefined;
  /** Validation commands for the Tester; defaults to detected package.json scripts. */
  testCommands?: string[] | undefined;
};

export type DecideInput = {
  decision: ApprovalDecision;
  reviewer?: string | undefined;
  comment?: string | undefined;
};

export type OrchestratorDeps = {
  store: RunStore;
  llm: LlmProvider;
  github: GitHubClient;
  workspacesRoot: string;
  model: string;
  limits?: RunLimits;
  events?: EventSink;
  /** Extra denied paths appended to every agent policy. */
  deniedPaths?: string[];
};

/** Persists events through the store while staying an EventSink. */
class StoreEventSink implements EventSink {
  constructor(private readonly store: RunStore) {}
  async emit(event: Parameters<RunStore["appendEvent"]>[0]): Promise<void> {
    await this.store.appendEvent(event);
  }
}

type CoderFailure =
  | { kind: "test_failure"; testResult: TestResult }
  | { kind: "review_changes"; feedback: string };

/**
 * The Run Orchestrator drives one issue through the agent pipeline:
 * plan -> code -> test (with bounded retries) -> review -> human
 * approval -> pull request (docs/architecture.md sections 13 and 33).
 *
 * It pauses at `awaiting_approval`; `decide` resumes or ends the run.
 */
export class RunOrchestrator {
  private readonly store: RunStore;
  private readonly llm: LlmProvider;
  private readonly github: GitHubClient;
  private readonly workspacesRoot: string;
  private readonly model: string;
  private readonly limits: RunLimits;
  private readonly events: EventSink;
  private readonly deniedPaths: string[];

  constructor(deps: OrchestratorDeps) {
    this.store = deps.store;
    this.llm = deps.llm;
    this.github = deps.github;
    this.workspacesRoot = deps.workspacesRoot;
    this.model = deps.model;
    this.limits = deps.limits ?? DEFAULT_RUN_LIMITS;
    this.events = deps.events ?? new StoreEventSink(deps.store);
    this.deniedPaths = deps.deniedPaths ?? [];
  }

  /**
   * Create the run record and emit run.created. Pair with `executeRun`
   * when the caller needs the run id before the pipeline finishes (e.g.
   * an API that kicks off execution in the background).
   */
  async createRun(input: StartRunInput): Promise<AgentRun> {
    const repository = await this.store.upsertRepository({
      owner: input.owner,
      name: input.repo,
      ...(input.defaultBranch !== undefined
        ? { defaultBranch: input.defaultBranch }
        : {}),
    });
    const workspacePath =
      input.workspacePath ??
      workspacePathFor(this.workspacesRoot, repository.owner, repository.name);
    const run = await this.store.createRun({
      repositoryId: repository.id,
      issueNumber: input.issueNumber,
      branchName: `ai-dev-team/issue-${input.issueNumber}`,
      workspacePath,
      ...(input.testCommands ? { testCommands: input.testCommands } : {}),
    });
    await emitEvent(this.events, {
      runId: run.id,
      type: "run.created",
      input: {
        repository: repository.fullName,
        issueNumber: input.issueNumber,
      },
    });
    return run;
  }

  /** Execute the pipeline for an existing run, to awaiting_approval or terminal. */
  async executeRun(runId: string): Promise<AgentRun> {
    const run = await this.requireRun(runId);
    const repository = await this.requireRepository(run.repositoryId);
    try {
      await this.pipeline(runId, repository, {});
    } catch (error) {
      await this.fail(runId, error);
    }
    return (await this.store.getRun(runId)) ?? run;
  }

  /** Create a run and drive it to awaiting_approval or a terminal state. */
  async startRun(input: StartRunInput): Promise<AgentRun> {
    const run = await this.createRun(input);
    return this.executeRun(run.id);
  }

  /** Human decision at the approval gate (docs/architecture.md section 22). */
  async decide(runId: string, input: DecideInput): Promise<AgentRun> {
    const run = await this.requireRun(runId);
    if (run.status !== "awaiting_approval") {
      throw new HarnessError(
        "INVALID_AGENT_OUTPUT",
        `Run ${runId} is ${run.status}, not awaiting_approval`,
      );
    }
    const repository = await this.requireRepository(run.repositoryId);
    await this.store.recordApproval({
      runId,
      decision: input.decision,
      ...(input.reviewer !== undefined ? { reviewer: input.reviewer } : {}),
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    });

    switch (input.decision) {
      case "rejected": {
        await emitEvent(this.events, {
          runId,
          type: "approval.rejected",
          input: { comment: input.comment },
        });
        await this.transition(runId, "rejected");
        await this.store.updateRun(runId, {
          completedAt: new Date(),
          error: {
            category: "HUMAN_REJECTION",
            message: input.comment ?? "Rejected by reviewer",
          },
        });
        await emitEvent(this.events, { runId, type: "run.completed" });
        break;
      }
      case "changes_requested": {
        await emitEvent(this.events, {
          runId,
          type: "approval.changes_requested",
          input: { comment: input.comment },
        });
        try {
          await this.pipeline(runId, repository, {
            resumeAtCoding: input.comment ?? "Changes requested",
          });
        } catch (error) {
          await this.fail(runId, error);
        }
        break;
      }
      case "approved": {
        await emitEvent(this.events, { runId, type: "approval.granted" });
        await this.transition(runId, "approved");
        try {
          await this.createPullRequest(runId, repository);
        } catch (error) {
          await this.fail(runId, error);
        }
        break;
      }
    }
    return (await this.store.getRun(runId)) ?? run;
  }

  /* ------------------------------------------------------------- */

  private async pipeline(
    runId: string,
    repository: Repository,
    opts: { resumeAtCoding?: string },
  ): Promise<void> {
    const persisted = await this.requireRun(runId);
    const workspacePath =
      persisted.workspacePath ??
      workspacePathFor(this.workspacesRoot, repository.owner, repository.name);
    await this.assertWorkspace(workspacePath);

    const issue = await this.github.getIssue(
      { owner: repository.owner, name: repository.name },
      persisted.issueNumber,
    );
    const repoCtx: RepositoryContext = {
      repository,
      workspacePath,
      fileTree: await listTrackedFiles(workspacePath).catch(() => []),
      testCommands:
        persisted.testCommands ?? (await detectTestCommands(workspacePath)),
    };
    const deps: AgentDeps = {
      runId,
      llm: this.llm,
      events: this.events,
      model: this.model,
    };
    const tracker = await RunTracker.restore(runId, this.store, this.limits, this.model);

    let plan: ImplementationPlan;
    if (opts.resumeAtCoding !== undefined) {
      const saved = await this.store.getOutput(runId, "plan");
      if (!saved) {
        throw new HarnessError(
          "INVALID_AGENT_OUTPUT",
          `Run ${runId} has no stored plan to resume coding`,
        );
      }
      plan = saved.data as ImplementationPlan;
    } else {
      await this.transition(runId, "planning", "planner");
      plan = await this.withAgent(deps, "planner", workspacePath, plannerPolicy(), (inv) =>
        runPlanner(inv, { issue, repository: repoCtx }).then(async (r) => {
          await tracker.record(r.usage, r.iterations);
          return r.output;
        }),
      );
      await this.store.saveOutput({ runId, agent: "planner", kind: "plan", data: plan });
      await emitEvent(this.events, { runId, type: "plan.ready", agent: "planner" });
      await this.transition(runId, "plan_ready");
    }

    const outcome = await this.codingPhase(
      runId,
      deps,
      tracker,
      workspacePath,
      repoCtx,
      issue,
      plan,
      opts.resumeAtCoding !== undefined
        ? { kind: "review_changes", feedback: opts.resumeAtCoding }
        : undefined,
    );
    if (!outcome) return; // run already failed

    await this.transition(runId, "reviewing", "reviewer");
    const review = await this.withAgent(
      deps,
      "reviewer",
      workspacePath,
      reviewerPolicy(),
      (inv) =>
        runReviewer(inv, {
          issue,
          repository: repoCtx,
          plan,
          codingResult: outcome.codingResult,
          testResult: outcome.testResult,
        }).then(async (r) => {
          await tracker.record(r.usage, r.iterations);
          return r.output;
        }),
    );
    await this.store.saveOutput({
      runId,
      agent: "reviewer",
      kind: "review_result",
      data: review,
    });
    await emitEvent(this.events, {
      runId,
      type: "review.completed",
      agent: "reviewer",
      output: { approved: review.approved },
    });
    await this.transition(runId, "review_complete");
    await this.transition(runId, "awaiting_approval");
    await emitEvent(this.events, { runId, type: "approval.requested" });
  }

  /**
   * Coder -> Tester with bounded retries (docs/architecture.md
   * section 14). Returns null when the run has already failed.
   */
  private async codingPhase(
    runId: string,
    deps: AgentDeps,
    tracker: RunTracker,
    workspacePath: string,
    repoCtx: RepositoryContext,
    issue: GitHubIssue,
    plan: ImplementationPlan,
    initialFailure?: CoderFailure,
  ): Promise<{ codingResult: CodingResult; testResult: TestResult } | null> {
    let previousFailure: CoderFailure | undefined = initialFailure;

    for (let round = 1; ; round++) {
      await this.transition(runId, "coding", "coder");

      const codingResult = await this.withAgent(
        deps,
        "coder",
        workspacePath,
        coderPolicy(repoCtx.testCommands),
        (inv) =>
          runCoder(inv, {
            issue,
            repository: repoCtx,
            plan,
            ...(previousFailure ? { previousFailure } : {}),
          }).then(async (r) => {
            await tracker.record(r.usage, r.iterations);
            return r.output;
          }),
      );
      await this.store.saveOutput({
        runId,
        agent: "coder",
        kind: "coding_result",
        data: codingResult,
      });
      await emitEvent(this.events, { runId, type: "code.ready", agent: "coder" });
      await this.transition(runId, "code_ready");
      await this.transition(runId, "testing", "tester");

      const testResult = await this.withAgent(
        deps,
        "tester",
        workspacePath,
        testerPolicy(repoCtx.testCommands),
        (inv) => runTester(inv, { commands: repoCtx.testCommands }),
      );
      await this.store.saveOutput({
        runId,
        agent: "tester",
        kind: "test_result",
        data: testResult,
      });

      if (testResult.passed) {
        return { codingResult, testResult };
      }

      if (round >= this.limits.maxCoderIterations) {
        await this.fail(
          runId,
          new HarnessError(
            "TEST_FAILURE",
            `Tests still failing after ${round} coder iterations: ${
              testResult.failures[0]?.message ?? "unknown"
            }`,
          ),
        );
        return null;
      }
      await this.store.updateRun(runId, { coderIterations: round });
      previousFailure = { kind: "test_failure", testResult };
    }
  }

  private async createPullRequest(
    runId: string,
    repository: Repository,
  ): Promise<void> {
    const run = await this.requireRun(runId);
    const repoRef = { owner: repository.owner, name: repository.name };
    const coding = await this.store.getOutput(runId, "coding_result");
    const plan = await this.store.getOutput(runId, "plan");
    const review = await this.store.getOutput(runId, "review_result");
    const tests = await this.store.getOutput(runId, "test_result");
    const codingResult = codingResultSchema.parse(coding?.data);
    const reviewResult = review ? reviewResultSchema.parse(review.data) : null;
    const testResult = tests?.data as TestResult | undefined;
    const planData = plan?.data as ImplementationPlan | undefined;

    const workspacePath =
      run.workspacePath ??
      workspacePathFor(this.workspacesRoot, repository.owner, repository.name);
    const branch = run.branchName ?? `ai-dev-team/run-${runId.slice(0, 8)}`;

    const files = await Promise.all(
      codingResult.changedFiles.map(async (rel) => ({
        path: rel,
        content: await readFile(resolveWithin(workspacePath, rel), "utf8"),
      })),
    );
    if (files.length === 0) {
      throw new HarnessError(
        "INVALID_AGENT_OUTPUT",
        "Coder reported no changed files; nothing to commit",
      );
    }

    try {
      await this.github.createBranch(repoRef, branch, repository.defaultBranch);
      await this.github.commitFiles(
        repoRef,
        branch,
        files,
        `feat: ${planData?.summary ?? `resolve issue #${run.issueNumber}`}`,
      );
      const pr = await this.github.createPullRequest(repoRef, {
        title: planData?.summary ?? `Resolve issue #${run.issueNumber}`,
        body: pullRequestBody({
          issueNumber: run.issueNumber,
          plan: planData,
          coding: codingResult,
          tests: testResult,
          review: reviewResult,
          runId,
        }),
        head: branch,
        base: repository.defaultBranch,
      });
      await this.store.savePullRequest({
        runId,
        repositoryId: repository.id,
        number: pr.number,
        url: pr.url,
        branch,
      });
      await this.store.updateRun(runId, { pullRequestNumber: pr.number });
      await emitEvent(this.events, {
        runId,
        type: "pull_request.created",
        output: { number: pr.number, url: pr.url },
      });
    } catch (error) {
      throw isHarnessError(error)
        ? error
        : new HarnessError("GITHUB_FAILURE", describeError(error), { cause: error });
    }
    await this.transition(runId, "pr_created");
    await this.store.updateRun(runId, { completedAt: new Date() });
    await emitEvent(this.events, { runId, type: "run.completed" });
  }

  /* ------------------------------------------------------------- */

  /** Wrap an agent invocation with started/completed/failed events. */
  private async withAgent<T>(
    deps: AgentDeps,
    agent: AgentType,
    workspaceRoot: string,
    policy: ToolPolicy,
    fn: (inv: AgentInvocation) => Promise<T>,
  ): Promise<T> {
    await emitEvent(this.events, {
      runId: deps.runId,
      type: "agent.started",
      agent,
    });
    const registry = new ToolRegistry();
    registry.registerAll(createCoreTools());
    const inv: AgentInvocation = {
      deps,
      harness: new AgentHarness({
        registry,
        policy: {
          ...policy,
          deniedPaths: [...policy.deniedPaths, ...this.deniedPaths],
        },
        workspaceRoot,
        events: this.events,
        runId: deps.runId,
        agent,
      }),
    };
    try {
      const result = await fn(inv);
      await emitEvent(this.events, {
        runId: deps.runId,
        type: "agent.completed",
        agent,
      });
      return result;
    } catch (error) {
      await emitEvent(this.events, {
        runId: deps.runId,
        type: "agent.failed",
        agent,
        output: { error: describeError(error) },
      });
      throw error;
    }
  }

  private async transition(
    runId: string,
    to: RunStatus,
    currentAgent?: AgentType,
  ): Promise<void> {
    const run = await this.requireRun(runId);
    assertTransition(run.status, to);
    await this.store.updateRun(runId, {
      status: to,
      currentAgent: currentAgent ?? null,
    });
    await emitEvent(this.events, {
      runId,
      type: "run.status_changed",
      metadata: { from: run.status, to },
    });
  }

  private async fail(runId: string, error: unknown): Promise<void> {
    const category: FailureCategory = isHarnessError(error)
      ? error.category
      : "TOOL_FAILURE";
    const message = describeError(error);
    try {
      const run = await this.store.getRun(runId);
      if (run && run.status !== "failed") {
        await this.store.updateRun(runId, {
          status: "failed",
          completedAt: new Date(),
          error: { category, message },
          currentAgent: null,
        });
      }
    } catch {
      // if persisting the failure itself fails, still emit the event
    }
    const type =
      category === "RUN_LIMIT_EXCEEDED" ? "run.limit_exceeded" : "run.failed";
    await emitEvent(this.events, {
      runId,
      type,
      output: { category, message },
    });
  }

  private async requireRun(runId: string): Promise<AgentRun> {
    const run = await this.store.getRun(runId);
    if (!run) throw new HarnessError("TOOL_FAILURE", `Run not found: ${runId}`);
    return run;
  }

  private async requireRepository(id: string): Promise<Repository> {
    const repo = await this.store.getRepository(id);
    if (!repo) {
      throw new HarnessError("TOOL_FAILURE", `Repository not found: ${id}`);
    }
    return repo;
  }

  private async assertWorkspace(workspacePath: string): Promise<void> {
    // .git may be a directory or a gitfile (worktrees/submodules)
    const ok = await stat(path.join(workspacePath, ".git")).then(() => true).catch(() => false);
    if (!ok) {
      throw new HarnessError(
        "TOOL_FAILURE",
        `Workspace is not a git checkout: ${workspacePath}. Clone the target repository into the workspaces root first.`,
      );
    }
  }
}

/** Accumulates token usage and enforces run limits after each agent step. */
class RunTracker {
  private constructor(
    private readonly runId: string,
    private readonly store: RunStore,
    private readonly limits: RunLimits,
    private readonly model: string,
    private readonly startedAt: Date,
    private usage: TokenUsage,
    private iterations: number,
  ) {}

  static async restore(
    runId: string,
    store: RunStore,
    limits: RunLimits,
    model: string,
  ): Promise<RunTracker> {
    const run = await store.getRun(runId);
    return new RunTracker(
      runId,
      store,
      limits,
      model,
      run?.startedAt ?? new Date(),
      run?.tokenUsage ?? { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      run?.iterationCount ?? 0,
    );
  }

  async record(
    delta: { inputTokens: number; outputTokens: number },
    iterations: number,
  ): Promise<void> {
    this.usage = {
      inputTokens: this.usage.inputTokens + delta.inputTokens,
      outputTokens: this.usage.outputTokens + delta.outputTokens,
      estimatedCostUsd:
        this.usage.estimatedCostUsd + estimateCostUsd(this.model, delta),
    };
    this.iterations += iterations;
    const check = evaluateLimits(
      {
        iterations: this.iterations,
        startedAt: this.startedAt,
        tokenUsage: this.usage,
      },
      this.limits,
    );
    await this.store.updateRun(this.runId, {
      tokenUsage: this.usage,
      iterationCount: this.iterations,
    });
    if (check.exceeded) {
      throw new HarnessError(
        "RUN_LIMIT_EXCEEDED",
        check.reason ?? "run limit exceeded",
      );
    }
  }
}

function pullRequestBody(input: {
  issueNumber: number;
  plan?: ImplementationPlan | undefined;
  coding: CodingResult;
  tests?: TestResult | undefined;
  review: ReviewResult | null;
  runId: string;
}): string {
  return [
    "## Summary",
    "",
    input.plan?.summary ?? `Resolve issue #${input.issueNumber}`,
    "",
    `Closes #${input.issueNumber}`,
    "",
    "## Changes",
    "",
    ...input.coding.changedFiles.map((f) => `- \`${f}\``),
    "",
    "## Tests",
    "",
    ...(input.tests?.commands.map(
      (c) => `- \`${c.command}\` ${c.passed ? "(passed)" : "(failed)"}`,
    ) ?? []),
    "",
    "## Review",
    "",
    input.review
      ? input.review.approved
        ? "Reviewer: approved"
        : `Reviewer: ${input.review.blockingIssues.length} blocking issue(s)`
      : "No review recorded",
    "",
    "## AI Dev Team",
    "",
    `Agent run: ${input.runId}`,
  ].join("\n");
}
