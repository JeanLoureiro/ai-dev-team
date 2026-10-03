/**
 * Human-in-the-loop approval (docs/architecture.md section 22).
 * Mandatory for v0.1: a run cannot reach `pr_created` without it.
 */
export const APPROVAL_DECISIONS = [
  "approved",
  "rejected",
  "changes_requested",
] as const;

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export type Approval = {
  id: string;
  runId: string;
  decision: ApprovalDecision;
  reviewer?: string;
  comment?: string;
  createdAt: Date;
};
