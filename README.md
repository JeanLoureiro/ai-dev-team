# AI Dev Team

An AI-powered software engineering system that turns a GitHub issue into a
tested pull request, with mandatory human approval. See
[docs/architecture.md](docs/architecture.md) for the full design.

> **Status:** v0.1 foundation. The vertical slice
> `issue -> plan -> code -> test -> review -> approve -> PR` is wired
> end-to-end; agents run through the harness with enforced policies.

## Repository layout

```text
apps/
  web/               Next.js control plane: dashboard, run timeline, approvals, API
packages/
  types/             Shared domain types + zod schemas for structured agent outputs
  harness/           Agent harness: tool registry, policy enforcement, state machine, limits, events
  tools/             Workspace tools: read/list/write/edit/search, run_command, git_diff
  agents/            planner, coder, tester, reviewer + the bounded agent loop
  llm/               Provider-agnostic LLM interface + Anthropic implementation + fake
  github/            GitHub client (token or GitHub App auth) + fake
  orchestrator/      Run pipeline: transitions, retries, approval gate, PR creation
  store/             RunStore: in-memory (default) and Supabase implementations
  evaluation/        Eval task model, scoring, metrics
supabase/
  migrations/        Postgres schema (repositories, agent_runs, agent_events, ...)
docs/                Architecture
```

## Getting started

```sh
pnpm install
cp .env.example apps/web/.env.local   # fill in credentials
pnpm dev                               # Next.js on http://localhost:3000
```

### Requirements

- Node.js 22+
- pnpm 10+

### Configuration

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude provider key (or `AI_DEV_TEAM_FAKE_LLM=1` for a stub) |
| `ANTHROPIC_MODEL` | Model id, defaults to `claude-sonnet-4-5` |
| `GITHUB_TOKEN` | Token auth for the GitHub client |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` | GitHub App auth (preferred, least privilege) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Persistence; falls back to in-memory |
| `AI_DEV_TEAM_WORKSPACES` | Root dir containing local checkouts as `<owner>__<name>` |

### Target repositories

The MVP operates on **local git checkouts**, not live clones: a run expects
the target repository at `<AI_DEV_TEAM_WORKSPACES>/<owner>__<name>` (or an
explicit `workspacePath`). The workspace must have a `.git`. Cloning and
disposable workers are intentionally future work (architecture section 24).

The Tester runs the repository's configured validation commands. By default
they are detected from `package.json` scripts (`typecheck`, `lint`, `test`),
or passed explicitly via `testCommands`.

### Database

Apply `supabase/migrations/` to your Supabase project (or a local
`supabase start` instance), then set `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Without them the app runs fully in-memory.

## Verification

```sh
pnpm lint        # eslint (typescript-eslint)
pnpm typecheck   # tsc --noEmit per package
pnpm test        # vitest
pnpm build       # turbo build (Next.js)
```

## Design in one line

Agents provide intelligence; the harness provides control. The LLM reasons
and requests actions; the deterministic harness decides whether they are
permitted, executes them, records the results, and drives the state machine.
