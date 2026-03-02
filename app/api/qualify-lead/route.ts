import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";
import { calculateLeadScore } from "@/app/lib/lead-scorer";
import type { QualifyLeadParams } from "@/app/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body: QualifyLeadParams = await req.json();
  const db = getDb();
  const decisionMakerValue =
    typeof body.is_decision_maker === "boolean"
      ? body.is_decision_maker
        ? 1
        : 0
      : null;

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
      `UPDATE calls
       SET lead_score = ?,
           lead_name = COALESCE(?, lead_name),
           lead_email = COALESCE(?, lead_email),
           drop_off_stage = CASE WHEN appointment_booked = 1 THEN 'booked' ELSE 'booking' END
       WHERE vapi_call_id = ?`
    ).run(score, body.lead_name || null, body.lead_email || null, callId);
    dbCallId = existing.id;
  }

  // Lead-Daten speichern oder aktualisieren (Upsert)
  db.prepare(
    `INSERT INTO lead_data (call_id, company_size, budget, is_decision_maker, timeline, pain_point, current_tools)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(call_id) DO UPDATE SET
       company_size = COALESCE(excluded.company_size, lead_data.company_size),
       budget = COALESCE(excluded.budget, lead_data.budget),
       is_decision_maker = COALESCE(excluded.is_decision_maker, lead_data.is_decision_maker),
       timeline = COALESCE(excluded.timeline, lead_data.timeline),
       pain_point = COALESCE(excluded.pain_point, lead_data.pain_point),
       current_tools = COALESCE(excluded.current_tools, lead_data.current_tools)`
  ).run(
    dbCallId,
    body.company_size || null,
    body.budget || null,
    decisionMakerValue,
    body.timeline || null,
    body.pain_point || null,
    body.current_tools || null
  );

  return NextResponse.json({ lead_score: score, vapi_call_id: callId });
}
