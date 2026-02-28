// Dieser Webhook wird für echte Telefonanrufe via VAPI verwendet.
// Für Browser-Demo: Tool-Calls werden direkt client-seitig verarbeitet.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";
import { calculateLeadScore } from "@/app/lib/lead-scorer";
import { bookDemoAppointment } from "@/app/lib/calcom";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message } = body;

  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  const db = getDb();
  const callId = message.call?.id;

  switch (message.type) {
    case "call-start": {
      if (callId) {
        db.prepare(
          `INSERT OR IGNORE INTO calls (vapi_call_id, drop_off_stage)
           VALUES (?, 'greeting')`
        ).run(callId);
      }
      break;
    }

    case "function-call": {
      const fn = message.functionCall;
      const params = fn?.parameters || {};

      if (!callId) break;

      // Call-Eintrag sicherstellen
      db.prepare(
        "INSERT OR IGNORE INTO calls (vapi_call_id) VALUES (?)"
      ).run(callId);

      const call = db
        .prepare("SELECT id FROM calls WHERE vapi_call_id = ?")
        .get(callId) as { id: number } | undefined;

      if (!call) break;

      if (fn?.name === "qualifyLead") {
        const score = calculateLeadScore(params);

        db.prepare(
          `UPDATE calls SET lead_score = ?, lead_name = ?, lead_email = ?,
           drop_off_stage = 'booking' WHERE vapi_call_id = ?`
        ).run(
          score,
          params.lead_name || null,
          params.lead_email || null,
          callId
        );

        const hasData = db
          .prepare("SELECT id FROM lead_data WHERE call_id = ?")
          .get(call.id);

        if (!hasData) {
          db.prepare(
            `INSERT INTO lead_data (call_id, company_size, budget, is_decision_maker,
             timeline, pain_point, current_tools) VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            call.id,
            params.company_size || null,
            params.budget || null,
            params.is_decision_maker ? 1 : 0,
            params.timeline || null,
            params.pain_point || null,
            params.current_tools || null
          );
        }

        return NextResponse.json({ result: `Lead qualifiziert. Score: ${score}` });
      }

      if (fn?.name === "bookDemoAppointment") {
        const result = await bookDemoAppointment({
          name: params.lead_name || "Lead",
          email: params.lead_email || "lead@example.com",
          preferred_time: params.preferred_time,
        });

        if (result.success) {
          db.prepare(
            `UPDATE calls SET appointment_booked = 1, appointment_time = ?,
             appointment_url = ?, drop_off_stage = 'booked' WHERE vapi_call_id = ?`
          ).run(result.start_time || null, result.booking_url || null, callId);

          return NextResponse.json({
            result: `Termin erfolgreich gebucht! ${result.message || ""}`,
          });
        }

        return NextResponse.json({
          result:
            "Entschuldigung, bei der Buchung ist ein Fehler aufgetreten. Ich notiere Ihren Wunschtermin.",
        });
      }

      break;
    }

    case "end-of-call-report": {
      const transcript =
        message.artifact?.transcript || message.transcript || "";
      const summary = message.summary || message.artifact?.summary || "";
      const duration = message.durationSeconds || 0;

      if (callId) {
        db.prepare(
          `UPDATE calls SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ?,
           transcript = ?, summary = ? WHERE vapi_call_id = ?`
        ).run(duration, transcript, summary, callId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
