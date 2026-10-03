import Link from "next/link";
import { getStore } from "@/lib/deps";
import { NewRunForm } from "./new-run-form";
import { StatusBadge } from "./status-badge";

export const dynamic = "force-dynamic";

function formatDuration(startedAt: Date, completedAt?: Date): string {
  const end = completedAt ?? new Date();
  const seconds = Math.round((end.getTime() - startedAt.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function Dashboard() {
  const store = getStore();
  const [runs, repos] = await Promise.all([
    store.listRuns(50),
    store.listRepositories(),
  ]);
  const repoById = new Map(repos.map((r) => [r.id, r]));

  return (
    <>
      <h1>AI Dev Team</h1>
      <p className="muted">GitHub issue to tested pull request, with human approval.</p>

      <section className="panel">
        <h2>New run</h2>
        <NewRunForm />
      </section>

      <section className="panel">
        <h2>Runs</h2>
        {runs.length === 0 ? (
          <p className="muted">No runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Repository</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Cost</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link href={`/runs/${run.id}`}>{run.id.slice(0, 8)}</Link>
                  </td>
                  <td>{repoById.get(run.repositoryId)?.fullName ?? run.repositoryId.slice(0, 8)}</td>
                  <td>#{run.issueNumber}</td>
                  <td>
                    <StatusBadge status={run.status} />
                  </td>
                  <td>${run.tokenUsage.estimatedCostUsd.toFixed(4)}</td>
                  <td>{formatDuration(run.startedAt, run.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
