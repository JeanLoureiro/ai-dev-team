-- AI Dev Team: initial schema (docs/architecture.md section 17).
--
-- The event log is append-oriented: agent_events rows are never updated.
-- All tables enable RLS; access goes through the service role server-side.

create type agent_type as enum ('planner', 'coder', 'tester', 'reviewer');

create type run_status as enum (
  'pending',
  'planning',
  'plan_ready',
  'coding',
  'code_ready',
  'testing',
  'reviewing',
  'review_complete',
  'awaiting_approval',
  'approved',
  'rejected',
  'pr_created',
  'failed'
);

create type approval_decision as enum ('approved', 'rejected', 'changes_requested');

create table repositories (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  name text not null,
  full_name text generated always as (owner || '/' || name) stored not null unique,
  default_branch text not null default 'main',
  installation_id bigint,
  created_at timestamptz not null default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references repositories(id) on delete cascade,
  issue_number integer not null,
  status run_status not null default 'pending',
  current_agent agent_type,
  iteration_count integer not null default 0,
  coder_iterations integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost_usd numeric(10, 6) not null default 0,
  branch_name text,
  workspace_path text,
  test_commands text[],
  pull_request_number integer,
  error jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index agent_runs_repository_id_idx on agent_runs (repository_id);
create index agent_runs_status_idx on agent_runs (status);

create table agent_events (
  id uuid primary key,
  run_id uuid not null references agent_runs(id) on delete cascade,
  type text not null,
  agent agent_type,
  input jsonb,
  output jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index agent_events_run_id_idx on agent_events (run_id, created_at);

create table agent_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  agent agent_type,
  kind text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index agent_outputs_run_id_idx on agent_outputs (run_id, kind);

create table agent_iterations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  agent agent_type not null,
  iteration integer not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index agent_iterations_run_id_idx on agent_iterations (run_id);

create table pull_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  repository_id uuid not null references repositories(id) on delete cascade,
  number integer not null,
  url text not null,
  branch text not null,
  created_at timestamptz not null default now()
);
create unique index pull_requests_run_id_idx on pull_requests (run_id);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  decision approval_decision not null,
  reviewer text,
  comment text,
  created_at timestamptz not null default now()
);
create index approvals_run_id_idx on approvals (run_id, created_at);

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete set null,
  task_id text,
  passed boolean not null,
  metrics jsonb,
  created_at timestamptz not null default now()
);

alter table repositories enable row level security;
alter table agent_runs enable row level security;
alter table agent_events enable row level security;
alter table agent_outputs enable row level security;
alter table agent_iterations enable row level security;
alter table pull_requests enable row level security;
alter table approvals enable row level security;
alter table evaluations enable row level security;
