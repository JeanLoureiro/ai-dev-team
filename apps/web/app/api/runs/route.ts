import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrchestrator, getStore } from "@/lib/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createRunSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  defaultBranch: z.string().optional(),
  workspacePath: z.string().optional(),
  testCommands: z.array(z.string()).optional(),
});

export async function GET() {
  const runs = await getStore().listRuns(50);
  return NextResponse.json({ runs });
}

/**
 * Create a run and execute the pipeline in the background
 * (docs/architecture.md section 29). A dedicated worker process is a
 * documented future step; for the MVP the Next.js server drives it.
 */
export async function POST(request: Request) {
  const parsed = createRunSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid request: ${parsed.error.issues[0]?.message}` },
      { status: 422 },
    );
  }
  try {
    const orchestrator = getOrchestrator();
    const run = await orchestrator.createRun(parsed.data);
    void orchestrator.executeRun(run.id).catch((error) => {
      console.error(`run ${run.id} crashed:`, error);
    });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
