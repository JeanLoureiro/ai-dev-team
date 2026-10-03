import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApprovalDecision } from "@ai-dev-team/types";
import { getOrchestrator } from "@/lib/deps";

const decisionSchema = z.object({
  reviewer: z.string().optional(),
  comment: z.string().optional(),
});

export async function decide(
  request: Request,
  runId: string,
  decision: ApprovalDecision,
) {
  const parsed = decisionSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  try {
    const run = await getOrchestrator().decide(runId, {
      decision,
      ...(parsed.data.reviewer !== undefined
        ? { reviewer: parsed.data.reviewer }
        : {}),
      ...(parsed.data.comment !== undefined
        ? { comment: parsed.data.comment }
        : {}),
    });
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}
