// Dieser Webhook wird für echte Telefonanrufe via VAPI verwendet.
// Für Browser-Demo: Tool-Calls werden direkt client-seitig verarbeitet.

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";
import { calculateLeadScore } from "@/app/lib/lead-scorer";
import { bookDemoAppointment } from "@/app/lib/calcom";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const digestHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const digestBase64 = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  const normalized = signature.trim();
  const candidates = [
    digestHex,
    `sha256=${digestHex}`,
    digestBase64,
    `sha256=${digestBase64}`,
  ];

  return candidates.some((candidate) => timingSafeEqual(normalized, candidate));
}

function isWebhookAuthorized(req: NextRequest, rawBody: string, secret: string): boolean {
  const headerSecret =
    req.headers.get("x-vapi-secret") ||
    req.headers.get("x-webhook-secret") ||
    getBearerToken(req.headers.get("authorization"));

  if (headerSecret && timingSafeEqual(headerSecret, secret)) {
    return true;
  }

  const signature = req.headers.get("x-vapi-signature");
  if (signature && verifyWebhookSignature(rawBody, signature, secret)) {
    return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let body: Record<string, unknown>;

  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (webhookSecret && !isWebhookAuthorized(req, rawBody, webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const message =
    body.message && typeof body.message === "object"
      ? (body.message as Record<string, unknown>)
      : undefined;

  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  const db = getDb();
  const callObj =
    message.call && typeof message.call === "object"
      ? (message.call as Record<string, unknown>)
      : undefined;
  const callId = typeof callObj?.id === "string" ? callObj.id : undefined;
  const messageType = typeof message.type === "string" ? message.type : "";

  switch (messageType) {
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
      const fn =
        message.functionCall && typeof message.functionCall === "object"
          ? (message.functionCall as Record<string, unknown>)
          : undefined;

      const params =
        fn?.parameters && typeof fn.parameters === "object"
          ? (fn.parameters as Record<string, unknown>)
          : {};

      if (!callId) break;

      // Call-Eintrag sicherstellen
      db.prepare("INSERT OR IGNORE INTO calls (vapi_call_id) VALUES (?)").run(callId);

      const call = db
        .prepare("SELECT id FROM calls WHERE vapi_call_id = ?")
        .get(callId) as { id: number } | undefined;

      if (!call) break;

      const fnName = typeof fn?.name === "string" ? fn.name : "";

      if (fnName === "qualifyLead") {
        const score = calculateLeadScore({
          company_size:
            typeof params.company_size === "string" ? params.company_size : undefined,
          budget: typeof params.budget === "string" ? params.budget : undefined,
          is_decision_maker:
            typeof params.is_decision_maker === "boolean"
              ? params.is_decision_maker
              : typeof params.is_decision_maker === "number"
              ? params.is_decision_maker
              : undefined,
          timeline: typeof params.timeline === "string" ? params.timeline : undefined,
          pain_point:
            typeof params.pain_point === "string" ? params.pain_point : undefined,
        });

        const leadName =
          typeof params.lead_name === "string" ? params.lead_name.trim() : "";
        const leadEmail =
          typeof params.lead_email === "string" ? params.lead_email.trim() : "";
        const decisionMakerValue =
          typeof params.is_decision_maker === "boolean"
            ? params.is_decision_maker
              ? 1
              : 0
            : typeof params.is_decision_maker === "number"
            ? params.is_decision_maker
            : null;

        db.prepare(
          `UPDATE calls
           SET lead_score = ?,
               lead_name = COALESCE(?, lead_name),
               lead_email = COALESCE(?, lead_email),
               drop_off_stage = CASE WHEN appointment_booked = 1 THEN 'booked' ELSE 'booking' END
           WHERE vapi_call_id = ?`
        ).run(score, leadName || null, leadEmail || null, callId);

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
          call.id,
          typeof params.company_size === "string" ? params.company_size : null,
          typeof params.budget === "string" ? params.budget : null,
          decisionMakerValue,
          typeof params.timeline === "string" ? params.timeline : null,
          typeof params.pain_point === "string" ? params.pain_point : null,
          typeof params.current_tools === "string" ? params.current_tools : null
        );

        return NextResponse.json({ result: `Lead qualifiziert. Score: ${score}` });
      }

      if (fnName === "bookDemoAppointment") {
        const leadName =
          typeof params.lead_name === "string" && params.lead_name.trim().length > 0
            ? params.lead_name
            : "Lead";
        const leadEmail =
          typeof params.lead_email === "string" && params.lead_email.trim().length > 0
            ? params.lead_email
            : "lead@example.com";

        const result = await bookDemoAppointment({
          name: leadName,
          email: leadEmail,
          preferred_time:
            typeof params.preferred_time === "string" ? params.preferred_time : undefined,
        });

        if (result.success) {
          db.prepare(
            `UPDATE calls
             SET appointment_booked = 1,
                 appointment_time = ?,
                 appointment_url = ?,
                 lead_name = COALESCE(lead_name, ?),
                 lead_email = COALESCE(lead_email, ?),
                 drop_off_stage = 'booked'
             WHERE vapi_call_id = ?`
          ).run(result.start_time || null, result.booking_url || null, leadName, leadEmail, callId);

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
      const artifact =
        message.artifact && typeof message.artifact === "object"
          ? (message.artifact as Record<string, unknown>)
          : undefined;

      const transcriptRaw = artifact?.transcript ?? message.transcript;
      const summaryRaw = message.summary ?? artifact?.summary;
      const durationRaw = message.durationSeconds;

      const transcript =
        typeof transcriptRaw === "string"
          ? transcriptRaw
          : transcriptRaw
          ? JSON.stringify(transcriptRaw)
          : "";
      const summary = typeof summaryRaw === "string" ? summaryRaw : "";
      const duration =
        typeof durationRaw === "number" && Number.isFinite(durationRaw)
          ? Math.max(0, Math.floor(durationRaw))
          : 0;

      if (callId) {
        db.prepare(
          `UPDATE calls
           SET ended_at = CURRENT_TIMESTAMP,
               duration_seconds = COALESCE(NULLIF(duration_seconds, 0), ?),
               transcript = COALESCE(NULLIF(transcript, ''), ?),
               summary = COALESCE(NULLIF(summary, ''), ?)
           WHERE vapi_call_id = ?`
        ).run(duration, transcript, summary, callId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
