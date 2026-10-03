import { NextResponse } from "next/server";
import { getStore } from "@/lib/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();
  const run = await store.getRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const outputs = await store.listOutputs(id);
  return NextResponse.json({ run, outputs });
}
