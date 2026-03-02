import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const vapiCallId = body?.vapi_call_id;

  if (!vapiCallId || typeof vapiCallId !== "string") {
    return NextResponse.json(
      { error: "vapi_call_id fehlt", success: false },
      { status: 400 }
    );
  }

  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO calls (vapi_call_id, drop_off_stage)
     VALUES (?, 'greeting')`
  ).run(vapiCallId);

  return NextResponse.json({ success: true, vapi_call_id: vapiCallId });
}
