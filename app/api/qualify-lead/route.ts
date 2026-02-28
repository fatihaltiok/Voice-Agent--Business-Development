import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";
import { calculateLeadScore } from "@/app/lib/lead-scorer";
import type { QualifyLeadParams } from "@/app/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body: QualifyLeadParams = await req.json();
  const db = getDb();

  const score = calculateLeadScore({
    company_size: body.company_size,
    budget: body.budget,
    is_decision_maker: body.is_decision_maker,
    timeline: body.timeline,
    pain_point: body.pain_point,
  });

  // Call-Eintrag erstellen oder aktualisieren
  const callId = body.vapi_call_id || `web-${Date.now()}`;

  const existing = db
    .prepare("SELECT id FROM calls WHERE vapi_call_id = ?")
    .get(callId) as { id: number } | undefined;

  let dbCallId: number;

  if (!existing) {
    const result = db
      .prepare(
        `INSERT INTO calls (vapi_call_id, lead_score, lead_name, lead_email, drop_off_stage)
         VALUES (?, ?, ?, ?, 'booking')`
      )
      .run(callId, score, body.lead_name || null, body.lead_email || null);
    dbCallId = result.lastInsertRowid as number;
  } else {
    db.prepare(
      `UPDATE calls SET lead_score = ?, lead_name = ?, lead_email = ?, drop_off_stage = 'booking'
       WHERE vapi_call_id = ?`
    ).run(score, body.lead_name || null, body.lead_email || null, callId);
    dbCallId = existing.id;
  }

  // Lead-Daten speichern
  const hasLeadData = db
    .prepare("SELECT id FROM lead_data WHERE call_id = ?")
    .get(dbCallId);

  if (!hasLeadData) {
    db.prepare(
      `INSERT INTO lead_data (call_id, company_size, budget, is_decision_maker, timeline, pain_point, current_tools)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      dbCallId,
      body.company_size || null,
      body.budget || null,
      body.is_decision_maker ? 1 : 0,
      body.timeline || null,
      body.pain_point || null,
      body.current_tools || null
    );
  }

  return NextResponse.json({ lead_score: score, vapi_call_id: callId });
}
