import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  CodingResult,
  ImplementationPlan,
  ReviewResult,
  TestResult,
} from "@ai-dev-team/types";
import { getStore } from "@/lib/deps";
import { StatusBadge } from "../../status-badge";
import { RunActions } from "./actions";
import { CollapsibleTimeline } from "./collapsible-timeline";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = getStore();
  const run = await store.getRun(id);
  if (!run) notFound();

  const [repo, events, outputs, approval] = await Promise.all([
    store.getRepository(run.repositoryId),
    store.listEvents(run.id),
    store.listOutputs(run.id),
    store.getLatestApproval(run.id),
  ]);
  const plan = outputs.find((o) => o.kind === "plan")?.data as
    | ImplementationPlan
    | undefined;
  const coding = outputs.find((o) => o.kind === "coding_result")?.data as
    | CodingResult
    | undefined;
  const tests = outputs.find((o) => o.kind === "test_result")?.data as
    | TestResult
    | undefined;
  const review = outputs.find((o) => o.kind === "review_result")?.data as
    | ReviewResult
    | undefined;

  return (
    <>
      <p>
        <Link href="/">&larr; runs</Link>
      </p>
      <h1>
        Run {run.id.slice(0, 8)} <StatusBadge status={run.status} />
      </h1>
      <section className="panel">
        <table>
          <tbody>
            <tr>
              <td className="muted">Repository</td>
              <td>{repo?.fullName ?? run.repositoryId}</td>
            </tr>
            <tr>
              <td className="muted">Issue</td>
              <td>#{run.issueNumber}</td>
            </tr>
            <tr>
              <td className="muted">Branch</td>
              <td>{run.branchName ?? "-"}</td>
            </tr>
            <tr>
              <td className="muted">Workspace</td>
              <td>{run.workspacePath ?? "-"}</td>
            </tr>
            <tr>
              <td className="muted">Iterations</td>
              <td>
                {run.iterationCount} (coder rounds: {run.coderIterations})
              </td>
            </tr>
            <tr>
              <td className="muted">Tokens</td>
              <td>
                {run.tokenUsage.inputTokens} in / {run.tokenUsage.outputTokens} out
              </td>
            </tr>
            <tr>
              <td className="muted">Cost</td>
              <td>${run.tokenUsage.estimatedCostUsd.toFixed(4)}</td>
            </tr>
            {run.pullRequestNumber ? (
              <tr>
                <td className="muted">Pull request</td>
                <td>#{run.pullRequestNumber}</td>
              </tr>
            ) : null}
            {run.error ? (
              <tr>
                <td className="muted">Error</td>
                <td>
                  {run.error.category}: {run.error.message}
                </td>
              </tr>
            ) : null}
            {approval ? (
              <tr>
                <td className="muted">Approval</td>
                <td>
                  {approval.decision}
                  {approval.comment ? ` - ${approval.comment}` : ""}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {run.status === "awaiting_approval" ? (
        <section className="panel">
          <h2>Human approval</h2>
          <RunActions runId={run.id} />
        </section>
      ) : null}

      {plan ? (
        <section className="panel">
          <h2>Plan</h2>
          <p>{plan.summary}</p>
          <PlanList title="Requirements" items={plan.requirements} />
          <PlanList title="Files to modify" items={plan.filesToModify} mono />
          <PlanList title="Files to create" items={plan.filesToCreate} mono />
          <PlanList title="Tests required" items={plan.testsRequired} />
          <PlanList title="Risks" items={plan.risks} />
        </section>
      ) : null}

      {coding ? (
        <section className="panel">
          <h2>Implementation</h2>
          <p>{coding.summary}</p>
          <PlanList title="Changed files" items={coding.changedFiles} mono />
          <PlanList title="Tests added" items={coding.testsAdded} mono />
        </section>
      ) : null}

      {tests ? (
        <section className="panel">
          <h2>Tests {tests.passed ? "(passed)" : "(failed)"}</h2>
          {tests.commands.map((c) => (
            <p key={c.command}>
              <code>{c.command}</code> - exit {c.exitCode} (
              {Math.round(c.durationMs)}ms)
            </p>
          ))}
          {tests.failures.map((f, i) => (
            <pre key={i}>{f.message}</pre>
          ))}
        </section>
      ) : null}

      {review ? (
        <section className="panel">
          <h2>Review {review.approved ? "(approved)" : "(not approved)"}</h2>
          {review.blockingIssues.map((i, n) => (
            <p key={n}>
              blocking: {i.file ? `${i.file}: ` : ""}
              {i.message}
            </p>
          ))}
          {review.suggestions.map((i, n) => (
            <p key={n} className="muted">
              suggestion: {i.file ? `${i.file}: ` : ""}
              {i.message}
            </p>
          ))}
        </section>
      ) : null}

      <CollapsibleTimeline events={events} />
    </>
  );
}

function PlanList({
  title,
  items,
  mono,
}: {
  title: string;
  items: string[];
  mono?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <h3 className="muted">{title}</h3>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{mono ? <code>{item}</code> : item}</li>
        ))}
      </ul>
    </>
  );
}
