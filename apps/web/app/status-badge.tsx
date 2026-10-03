import type { RunStatus } from "@ai-dev-team/types";

const BUSY: RunStatus[] = [
  "planning",
  "coding",
  "testing",
  "reviewing",
  "awaiting_approval",
];
const GOOD: RunStatus[] = ["pr_created"];
const BAD: RunStatus[] = ["failed", "rejected"];

export function StatusBadge({ status }: { status: RunStatus }) {
  const cls = GOOD.includes(status)
    ? "badge ok"
    : BAD.includes(status)
      ? "badge bad"
      : BUSY.includes(status)
        ? "badge busy"
        : "badge";
  return <span className={cls}>{status}</span>;
}
