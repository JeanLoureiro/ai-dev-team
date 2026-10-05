import { readdir } from "node:fs/promises";
import { getGithub, getOrchestrator, getStore, getWorkspacesRoot } from "./deps";

/**
 * Issue watcher (docs/architecture.md section 20): polls GitHub for new
 * open issues on every repository that has a local workspace checkout
 * (<root>/<owner>__<name>) and starts a run for each one. A webhook is
 * the documented upgrade path for deployed environments; polling keeps
 * local development free of tunnel setup.
 *
 * Semantics: the first poll per repo only records the current highest
 * issue number, so issues that already existed when the watcher started
 * are never auto-run. Issues created afterwards trigger one run each;
 * issues that already have a run (any status) are skipped.
 */

type WatchedRepo = { owner: string; name: string };
type RepoState = { highWaterMark: number };

type Globals = typeof globalThis & { __aiDevTeamWatcher?: NodeJS.Timeout };
const g = globalThis as Globals;

const INTERVAL_MS = Number(
  process.env.AI_DEV_TEAM_WATCH_INTERVAL_MS ?? 30_000,
);

export function startIssueWatcher(): void {
  if (g.__aiDevTeamWatcher) return;
  const state = new Map<string, RepoState>();
  g.__aiDevTeamWatcher = setInterval(() => {
    tick(state).catch((error) =>
      console.error("issue watcher tick failed:", error),
    );
  }, INTERVAL_MS);
  console.log(`ai-dev-team: watching for new issues every ${INTERVAL_MS}ms`);
}

function parseWorkspaceDir(entry: string): WatchedRepo | undefined {
  const sep = entry.indexOf("__");
  if (sep <= 0 || sep === entry.length - 2) return undefined;
  return { owner: entry.slice(0, sep), name: entry.slice(sep + 2) };
}

async function watchedRepos(): Promise<WatchedRepo[]> {
  const entries = await readdir(getWorkspacesRoot(), {
    withFileTypes: true,
  }).catch(() => []);
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => parseWorkspaceDir(e.name))
    .filter((r): r is WatchedRepo => r !== undefined);
}

async function tick(state: Map<string, RepoState>): Promise<void> {
  const repos = await watchedRepos();
  if (repos.length === 0) return;

  const github = getGithub();
  const orchestrator = getOrchestrator();
  const store = getStore();
  const repositories = await store.listRepositories();
  const runsByRepoIssue = new Set(
    (await store.listRuns(200)).map((r) => `${r.repositoryId}#${r.issueNumber}`),
  );

  for (const repo of repos) {
    const key = `${repo.owner}/${repo.name}`;
    let issues;
    try {
      issues = await github.listOpenIssues({
        owner: repo.owner,
        name: repo.name,
      });
    } catch (error) {
      console.warn(
        `issue watcher: listOpenIssues ${key} failed:`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }
    const maxNumber = Math.max(0, ...issues.map((i) => i.number));

    const repoState = state.get(key);
    if (!repoState) {
      state.set(key, { highWaterMark: maxNumber });
      continue;
    }
    const fresh = issues.filter((i) => i.number > repoState.highWaterMark);
    repoState.highWaterMark = Math.max(repoState.highWaterMark, maxNumber);
    if (fresh.length === 0) continue;

    const repository = repositories.find(
      (r) => r.owner === repo.owner && r.name === repo.name,
    );
    for (const issue of fresh.reverse()) {
      if (
        repository &&
        runsByRepoIssue.has(`${repository.id}#${issue.number}`)
      ) {
        continue;
      }
      console.log(
        `issue watcher: starting run for ${key}#${issue.number} "${issue.title}"`,
      );
      try {
        const run = await orchestrator.createRun({
          owner: repo.owner,
          repo: repo.name,
          issueNumber: issue.number,
        });
        runsByRepoIssue.add(`${run.repositoryId}#${issue.number}`);
        void orchestrator.executeRun(run.id).catch((error) =>
          console.error(`issue watcher: run ${run.id} crashed:`, error),
        );
      } catch (error) {
        console.error(
          `issue watcher: failed to start run for ${key}#${issue.number}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}
