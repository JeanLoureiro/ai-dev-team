import { NextResponse } from "next/server";
import { getStore } from "@/lib/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const events = await getStore().listEvents(id);
  return NextResponse.json({ events });
}
