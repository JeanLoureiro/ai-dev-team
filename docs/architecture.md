# AI Dev Team — Architecture

> **Status:** Draft
> **Version:** 0.1
> **Last Updated:** 2026-10-03

## 1. Overview

AI Dev Team is an AI-powered software engineering system that turns a GitHub issue into a tested pull request.

The system uses specialised AI agents operating inside a deterministic execution harness.

The core workflow is:

```text
GitHub Issue
     │
     ▼
┌─────────────┐
│   Planner   │
└──────┬──────┘
       │ Implementation Plan
       ▼
┌─────────────┐
│    Coder    │
└──────┬──────┘
       │ Code Changes
       ▼
┌─────────────┐
│   Tester    │
└──────┬──────┘
       │ Test Results
       ▼
┌─────────────┐
│   Reviewer  │
└──────┬──────┘
       │ Review Result
       ▼
 Human Approval
       │
       ▼
 GitHub Pull Request
```

AI Dev Team is intentionally designed around **controlled agent autonomy** rather than allowing an LLM to operate without constraints.

The LLM determines *what it wants to do*.

The AI Dev Team harness determines *what it is actually allowed to do*.

---

# 2. Goals

## Primary goals

AI Dev Team should:

1. Receive a GitHub issue.
2. Understand the repository and issue requirements.
3. Produce an implementation plan.
4. Implement the change.
5. Run relevant tests.
6. Review the implementation.
7. Allow a human to approve or reject the result.
8. Create a GitHub pull request.
9. Record the complete execution history.
10. Measure agent performance.

## Engineering goals

The system should demonstrate:

* Agent orchestration
* Tool use
* Structured LLM outputs
* Deterministic execution
* Agent state management
* Sandboxed code execution
* Human-in-the-loop workflows
* Retry and failure handling
* Observability
* Evaluation
* Cost and token tracking
* Reproducibility

---

# 3. Non-goals for v0.1

AI Dev Team will **not** initially attempt to:

* Automatically merge pull requests.
* Modify production infrastructure.
* Deploy applications.
* Support every programming language.
* Support multiple repositories simultaneously within one run.
* Autonomously resolve arbitrary GitHub issues.
* Allow unrestricted shell access.
* Build a general-purpose autonomous coding agent.

The initial target is:

> Given a TypeScript repository and a well-defined GitHub issue, AI Dev Team can produce a tested pull request with human approval.

---

# 4. High-Level Architecture

```text
                         ┌─────────────────────┐
                         │       GitHub        │
                         │                     │
                         │ Issues / PRs / Repo │
                         └──────────┬──────────┘
                                    │
                              Webhooks / API
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────┐
│                        AI Dev Team                            │
│                                                         │
│  ┌───────────────┐        ┌─────────────────────────┐  │
│  │   Next.js UI  │───────▶│      API / Control      │  │
│  └───────────────┘        └────────────┬────────────┘  │
│                                        │               │
│                                        ▼               │
│                              ┌──────────────────┐      │
│                              │  Run Orchestrator│      │
│                              └────────┬─────────┘      │
│                                       │                │
│                    ┌──────────────────┼────────────┐   │
│                    │                  │            │   │
│                    ▼                  ▼            ▼   │
│               ┌─────────┐       ┌─────────┐  ┌────────┐│
│               │ Planner │       │  Coder  │  │ Tester ││
│               └────┬────┘       └────┬────┘  └────┬───┘│
│                    │                 │              │   │
│                    └─────────────────┼──────────────┘   │
│                                      ▼                  │
│                                ┌──────────┐             │
│                                │ Reviewer │             │
│                                └────┬─────┘             │
│                                     │                   │
│                                     ▼                   │
│                              Human Approval             │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                 Agent Harness                     │  │
│  │                                                   │  │
│  │ Tool Registry │ Policies │ State │ Limits │ Logs │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
             │                         │
             ▼                         ▼
      ┌─────────────┐           ┌─────────────┐
      │   Supabase  │           │ LLM Provider│
      │  PostgreSQL │           │             │
      └─────────────┘           └─────────────┘
```

---

# 5. Architectural Principles

## 5.1 LLMs are not trusted execution environments

LLMs should never have unrestricted access to:

* The network
* The filesystem
* Production systems
* Secrets
* Databases
* Infrastructure

Every capability must be exposed through an explicit tool.

```text
Agent
  │
  │ requests:
  │ read_file("src/foo.ts")
  ▼
Harness
  │
  ├── Validate permission
  ├── Validate path
  ├── Execute tool
  ├── Record result
  └── Return result
```

---

## 5.2 Agents should have narrow responsibilities

Agents should not all be general-purpose coding agents.

Each agent has a specific responsibility.

| Agent    | Responsibility                                  |
| -------- | ----------------------------------------------- |
| Planner  | Understand issue and create implementation plan |
| Coder    | Implement the approved plan                     |
| Tester   | Validate implementation                         |
| Reviewer | Review implementation against requirements      |

This makes agents easier to:

* Test
* Evaluate
* Debug
* Replace
* Improve

---

## 5.3 Deterministic systems should handle deterministic work

The LLM should not be responsible for operations that software can perform reliably.

For example:

Bad:

```text
LLM:
"The tests appear to pass."
```

Better:

```text
Harness:
npm test

Exit code: 0

Tests:
42 passed
0 failed
```

The LLM interprets deterministic results rather than fabricating them.

---

## 5.4 Everything important should be observable

Every agent action should produce an event.

Example:

```text
agent.started
agent.tool_requested
tool.executed
tool.denied
agent.output_received
test.started
test.completed
review.completed
approval.requested
pull_request.created
```

This creates an auditable execution history.

---

# 6. Agent Architecture

## Planner

### Responsibility

Understand the issue and repository and produce an implementation plan.

### Inputs

```ts
type PlannerInput = {
  issue: GitHubIssue;
  repository: RepositoryContext;
};
```

### Output

```ts
type ImplementationPlan = {
  summary: string;
  requirements: string[];
  filesToModify: string[];
  filesToCreate: string[];
  testsRequired: string[];
  risks: string[];
};
```

The Planner cannot modify files.

### Plan Artifact (Lavish)

The `ImplementationPlan` is also rendered as an HTML deck using the Lavish skill (`lavish-axi` CLI) so humans can read, annotate, and update the plan before the Coder starts.

```text
ImplementationPlan (JSON)
     │
     ▼
plans/<run-id>/plan.html   (rendered deck)
     │
     ▼
npx -y lavish-axi plans/<run-id>/plan.html
     │
     ▼
Human annotations / feedback
     │
     ▼
Planner revises plan → re-render → approve
```

Rules:

* Get current workflow and design guidance from the CLI (`npx -y lavish-axi --help`, `npx -y lavish-axi design`, `npx -y lavish-axi playbook <id>`), not from copied instructions.
* The deck should include one slide/section per plan field: summary, requirements, files to modify, files to create, tests required, and risks.
* The structured `ImplementationPlan` remains the source of truth; the HTML deck is a review view generated from it.
* Human feedback from Lavish is fed back to the Planner, which produces a revised plan and re-renders the deck.
* The Coder only starts once the plan is approved.

---

# 7. Coder

## Responsibility

Implement the Planner's approved plan.

The Coder can:

* Read files
* Search the repository
* Modify files
* Run approved commands
* Inspect test failures

The Coder cannot:

* Access production systems
* Access secrets
* Modify protected paths
* Merge pull requests
* Change AI Dev Team configuration
* Bypass harness policies

### Output

```ts
type CodingResult = {
  changedFiles: string[];
  summary: string;
  testsAdded: string[];
};
```

---

# 8. Tester

## Responsibility

Determine whether the implementation satisfies the issue and passes the repository's test suite.

The Tester should prefer deterministic commands.

Example:

```text
npm test
npm run lint
npm run typecheck
```

The actual commands should come from repository configuration rather than being blindly generated by the LLM.

### Output

```ts
type TestResult = {
  passed: boolean;
  commands: TestCommandResult[];
  failures: TestFailure[];
};
```

---

# 9. Reviewer

## Responsibility

Review the completed implementation against:

1. Original issue
2. Implementation plan
3. Code changes
4. Test results

### Output

```ts
type ReviewResult = {
  approved: boolean;
  blockingIssues: ReviewIssue[];
  suggestions: ReviewIssue[];
};
```

The Reviewer does not directly modify code.

---

# 10. Agent Harness

The harness is the core safety and control layer of AI Dev Team.

```text
                  Agent
                    │
                    ▼
              Agent Harness
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
    Policies      Tools         State
       │            │            │
       ▼            ▼            ▼
   Permission   Execution     Persistence
```

The harness controls:

* Available tools
* Tool permissions
* Filesystem access
* Shell commands
* Timeouts
* Token limits
* Iteration limits
* Retry behaviour
* Agent state
* Logging
* Cost tracking

---

# 11. Tool Architecture

Tools are explicitly registered.

Example:

```ts
type AgentTool = {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<unknown>;
};
```

Initial tools:

```text
read_file
search_code
list_files
write_file
edit_file
run_command
git_diff
```

GitHub tools:

```text
get_issue
create_branch
create_pull_request
add_pull_request_comment
```

Tools should be scoped to the current run and agent.

---

# 12. Tool Policies

Each agent has a policy.

Example:

```ts
type ToolPolicy = {
  allowedTools: string[];
  allowedPaths: string[];
  deniedPaths: string[];
  allowedCommands: string[];
  maxExecutionTimeMs: number;
  maxIterations: number;
};
```

Example Coder policy:

```text
Allowed tools:
- read_file
- search_code
- list_files
- write_file
- edit_file
- run_command
- git_diff

Denied paths:
- .env
- .github/workflows/production.yml
- infrastructure/
```

The policy is enforced by the harness, not by the LLM prompt.

---

# 13. Agent State Machine

An agent run is represented as an explicit state machine.

```text
PENDING
   │
   ▼
PLANNING
   │
   ▼
PLAN_READY
   │
   ▼
CODING
   │
   ▼
CODE_READY
   │
   ▼
TESTING
   │
   ├──────────────┐
   │              │
   ▼              ▼
PASSED          FAILED
   │              │
   │              ▼
   │           CODING
   │
   ▼
REVIEWING
   │
   ▼
REVIEW_COMPLETE
   │
   ▼
AWAITING_APPROVAL
   │
   ├──────────────┐
   │              │
   ▼              ▼
APPROVED       REJECTED
   │
   ▼
PR_CREATED
```

Failure should always result in a recoverable state where possible.

---

# 14. Retry Strategy

Retries must be bounded.

Example:

```ts
const MAX_CODER_ITERATIONS = 3;
```

A failed test may return control to the Coder:

```text
Coder
  ↓
Tester
  ↓
Tests failed
  ↓
Coder
  ↓
Tester
```

After the maximum number of attempts:

```text
FAILED
```

The system should not continue indefinitely.

---

# 15. Agent Run

A AI Dev Team run represents one complete attempt to solve an issue.

```ts
type AgentRun = {
  id: string;
  repositoryId: string;
  issueNumber: number;

  status: RunStatus;

  startedAt: Date;
  completedAt?: Date;

  currentAgent?: AgentType;

  iterationCount: number;

  tokenUsage: {
    input: number;
    output: number;
  };

  estimatedCostUsd: number;

  pullRequestNumber?: number;
};
```

---

# 16. Event Model

Agent runs produce immutable events.

```ts
type AgentEvent = {
  id: string;
  runId: string;

  type: AgentEventType;

  agent?: AgentType;

  timestamp: Date;

  input?: unknown;
  output?: unknown;

  metadata?: Record<string, unknown>;
};
```

Example event stream:

```text
run.created
planner.started
tool.requested
tool.completed
planner.completed
coder.started
tool.requested
tool.completed
coder.completed
tester.started
test.completed
reviewer.started
reviewer.completed
approval.requested
approval.granted
pull_request.created
run.completed
```

Events provide the foundation for:

* Debugging
* Observability
* UI activity logs
* Evaluation
* Cost analysis
* Replaying runs

---

# 17. Persistence

Supabase/PostgreSQL will initially store:

```text
repositories
agent_runs
agent_events
agent_outputs
agent_iterations
pull_requests
approvals
evaluations
```

Potential relationships:

```text
Repository
   │
   └── Agent Runs
          │
          ├── Events
          ├── Iterations
          ├── Outputs
          ├── Evaluations
          └── Pull Request
```

The event log should be append-oriented.

Run state can be derived from the current state plus events where practical.

---

# 18. Repository Context

Agents need repository context, but should not receive the entire repository as an LLM prompt.

The system should progressively retrieve relevant information.

Example:

```text
Issue
  ↓
Repository metadata
  ↓
File tree
  ↓
Search
  ↓
Relevant files
  ↓
Relevant symbols
  ↓
Agent context
```

This reduces:

* Token usage
* Noise
* Context-window pressure
* Hallucination risk

---

# 19. Context Strategy

AI Dev Team should distinguish between:

### Persistent context

Information that remains useful throughout the run:

* Issue
* Repository metadata
* Branch
* Implementation plan

### Agent context

Information specific to the current agent:

* Relevant files
* Previous tool results
* Test failures

### Ephemeral context

Temporary information that does not need to persist:

* Intermediate reasoning
* Raw command output
* Temporary search results

The system should avoid passing the entire conversation history between every agent.

---

# 20. GitHub Integration

AI Dev Team will use a GitHub App rather than personal access tokens where practical.

The GitHub integration is responsible for:

```text
Repository access
Issue retrieval
Branch creation
Commit creation
Pull request creation
Pull request comments
Webhook handling
```

AI Dev Team should never expose GitHub credentials to an LLM.

---

# 21. Pull Request Lifecycle

Once the Reviewer approves:

```text
Agent implementation
       ↓
Git diff validation
       ↓
Tests
       ↓
Human approval
       ↓
Commit
       ↓
Push branch
       ↓
Create PR
```

The PR should contain:

```text
Summary
Implementation details
Tests performed
Agent run ID
Known limitations
```

Example:

```markdown
## Summary

Added CSV export to the reporting dashboard.

## Changes

- Added CSV export action
- Added export utility
- Added tests

## Tests

- npm run typecheck
- npm test
- npm run lint

## AI Dev Team

Agent Run: ai-dev-team-run-1024
```

---

# 22. Human-in-the-Loop

Human approval is mandatory for v0.1.

The human can:

```text
Approve
Reject
Request changes
```

A future version may support configurable autonomy levels:

```text
Level 0 — Suggest only

Level 1 — Modify code

Level 2 — Create PR

Level 3 — Respond to PR feedback

Level 4 — Merge PR
```

Higher autonomy requires stronger controls and evaluation.

---

# 23. Security Model

AI Dev Team assumes agents are potentially untrusted.

Security boundaries include:

### Filesystem

Agents operate inside an isolated workspace.

### Commands

Commands are allowlisted.

### Network

Network access should be disabled by default.

### Secrets

Secrets are never included in agent context.

### GitHub

Permissions should follow least privilege.

### Repository

Protected files and directories can be denied.

---

# 24. Execution Environment

Code execution should occur outside the main Next.js application.

Conceptually:

```text
Next.js
   │
   ▼
AI Dev Team API
   │
   ▼
Job / Agent Worker
   │
   ▼
Isolated Workspace
   │
   ├── Repository
   ├── Dependencies
   └── Test execution
```

The worker should be disposable.

A run should be reproducible from:

```text
Repository commit
+
Issue
+
Agent configuration
+
Model configuration
+
Tool policy
```

---

# 25. Observability

Every run should expose:

```text
Duration
Token usage
Estimated cost
Agent iterations
Tool calls
Tool failures
Test results
Review results
Human interventions
```

Example:

```text
Agent Run #1024

Duration             4m 32s
LLM cost             $0.38
Tool calls           47
Coder iterations     2
Tests                42 passed
Human interventions  1
```

---

# 26. Evaluation

AI Dev Team must have a repeatable evaluation suite.

The evaluation dataset should contain known GitHub issues with expected outcomes.

Example:

```text
Task                     Result
────────────────────────────────────
CSV export               PASS
Pagination               PASS
Search filter            PASS
Authentication fix      FAIL
Date formatting          PASS
```

Metrics:

```text
Task success rate
Test success rate
Review approval rate
Average iterations
Average cost
Average runtime
Human intervention rate
```

Evaluation results should be persisted.

---

# 27. Cost Control

LLM calls should be tracked per agent.

```ts
type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};
```

The system should support limits:

```text
Maximum run cost
Maximum tokens
Maximum agent iterations
Maximum execution time
```

If a limit is exceeded:

```text
RUN_LIMIT_EXCEEDED
```

The run stops rather than continuing indefinitely.

---

# 28. Failure Handling

Expected failure categories include:

```text
LLM_FAILURE
TOOL_FAILURE
TEST_FAILURE
TIMEOUT
PERMISSION_DENIED
INVALID_AGENT_OUTPUT
GITHUB_FAILURE
RUN_LIMIT_EXCEEDED
HUMAN_REJECTION
```

Failures should be explicit and observable.

Avoid generic:

```text
Something went wrong.
```

Prefer:

```text
TEST_FAILURE

Agent:
Tester

Command:
npm test

Exit code:
1

Failed tests:
3

Next action:
Return to Coder
```

---

# 29. API Boundary

The web application should not directly orchestrate individual LLM calls.

Instead:

```text
UI
 ↓
AI Dev Team API
 ↓
Run Orchestrator
 ↓
Agent Harness
 ↓
Agents
```

Example API:

```text
POST /api/runs
GET  /api/runs/:id
GET  /api/runs/:id/events
POST /api/runs/:id/approve
POST /api/runs/:id/reject
```

---

# 30. Frontend Architecture

The Next.js application provides:

### Dashboard

Overview of recent runs and metrics.

### Repository

Connected repositories.

### Issues

Issues available for execution.

### Agent Runs

Current and historical runs.

### Run Details

Real-time execution timeline.

Example:

```text
AI Dev Team Run #1024

● Planner             Complete
│
● Coder               Complete
│
● Tester              12/12 passing
│
● Reviewer            Approved
│
● Human approval      Pending
│
○ Pull Request        Waiting
```

The UI should consume events rather than polling individual agent state where practical.

---

# 31. Real-Time Updates

The run detail screen should receive events as they occur.

Conceptually:

```text
Worker
   │
   │ agent.completed
   ▼
Event Store
   │
   ▼
Realtime transport
   │
   ▼
Next.js
   │
   ▼
Run Timeline
```

The exact transport can be decided during implementation.

---

# 32. Initial Repository Structure

```text
ai-dev-team/
│
├── apps/
│   └── web/
│
├── packages/
│   ├── agents/
│   │   ├── planner/
│   │   ├── coder/
│   │   ├── tester/
│   │   └── reviewer/
│   │
│   ├── harness/
│   ├── github/
│   ├── llm/
│   ├── tools/
│   ├── types/
│   └── evaluation/
│
├── supabase/
│
├── docs/
│
└── README.md
```

The exact monorepo structure is subject to change as implementation begins.

---

# 33. MVP Architecture

The first implementation should be intentionally smaller than the final architecture.

```text
                 GitHub
                    │
                    ▼
              AI Dev Team API
                    │
                    ▼
             Run Orchestrator
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
       Agents              Supabase
          │
          ▼
       Harness
          │
     ┌────┼────┐
     ▼    ▼    ▼
   Files Git  Tests
     │    │    │
     └────┼────┘
          ▼
       GitHub PR
```

The MVP should prove the complete vertical slice before adding infrastructure complexity.

---

# 34. Future Architecture

Potential future capabilities:

* Multiple repositories
* Multiple simultaneous runs
* Agent memory
* Repository indexing
* Semantic code search
* Agent-to-agent communication
* Automated PR feedback loops
* Multiple LLM providers
* Model routing
* Evaluation-driven model selection
* Configurable autonomy levels
* Enterprise authentication
* Organisation-level policies
* Cost budgets
* Advanced sandboxing
* Agent replay
* Run comparison
* A/B testing of prompts and models

These are explicitly outside the initial implementation.

---

# 35. Key Architectural Decision

The central design principle of AI Dev Team is:

> **Agents provide intelligence; the harness provides control.**

The LLM should be allowed to reason, plan and request actions.

The deterministic AI Dev Team infrastructure decides whether those actions are permitted, executes them, records the results and controls the overall workflow.

This separation allows AI Dev Team to increase agent autonomy without giving up control of the system.

---

# 36. Initial Success Criteria

AI Dev Team v0.1 is successful when the following scenario works end-to-end:

```text
1. Connect a GitHub repository.

2. Select a GitHub issue.

3. Start a AI Dev Team run.

4. Planner analyses the issue and repository.

5. Coder implements the plan.

6. Tester runs the repository's tests.

7. If tests fail, Coder receives the failure and can retry.

8. Reviewer evaluates the final implementation.

9. Human reviews the result.

10. AI Dev Team creates a GitHub pull request.

11. The complete run is visible in AI Dev Team.

12. Cost, duration, iterations and tool usage are recorded.
```

The first major technical milestone is therefore:

> **Issue → Plan → Code → Test → Review → Human Approval → PR**

Everything else comes after this vertical slice works reliably.
