import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

type Empfehlung = "hot_lead" | "follow_up" | "nicht_qualifiziert";

interface SummaryData {
  zusammenfassung: string;
  kernproblem: string;
  naechste_schritte: string;
  einschaetzung: string;
  empfehlung: Empfehlung;
}

interface TranscriptEntry {
  role: string;
  text: string;
}

interface SummarizePayload {
  vapi_call_id?: string;
  transcript?: unknown;
  qualification?: unknown;
  lead_score?: string | null;
  duration_seconds?: number;
}

function normalizeTranscript(input: unknown): TranscriptEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const value = entry as Record<string, unknown>;
      if (typeof value.role !== "string" || typeof value.text !== "string") {
        return null;
      }
      return { role: value.role, text: value.text };
    })
    .filter((entry): entry is TranscriptEntry => entry !== null);
}

function transcriptToText(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => `${e.role === "assistant" ? "Sarah" : "Lead"}: ${e.text}`)
    .join("\n");
}

function isLeadScore(value: string | null | undefined): value is "A" | "B" | "C" {
  return value === "A" || value === "B" || value === "C";
}

function hasQualificationData(qualification: Record<string, unknown>): boolean {
  const keys = [
    "company_size",
    "budget",
    "is_decision_maker",
    "timeline",
    "pain_point",
    "lead_name",
    "lead_email",
  ];
  return keys.some((key) => {
    const value = qualification[key];
    if (typeof value === "boolean") return true;
    if (typeof value === "number") return true;
    return typeof value === "string" && value.trim().length > 0;
  });
}

function buildFallbackSummary(params: {
  leadScore: "A" | "B" | "C" | null;
  durationSeconds: number;
  transcriptEntries: TranscriptEntry[];
}): SummaryData {
  const minutes = Math.floor(params.durationSeconds / 60);
  const seconds = params.durationSeconds % 60;
  const durationLabel = `${minutes}m ${seconds}s`;

  const empfehlung: Empfehlung =
    params.leadScore === "A"
      ? "hot_lead"
      : params.leadScore === "C"
      ? "nicht_qualifiziert"
      : "follow_up";

  const leadMessages = params.transcriptEntries.filter((e) => e.role !== "assistant");
  const lastLeadMessage = leadMessages.length
    ? leadMessages[leadMessages.length - 1].text
    : "";

  return {
    zusammenfassung:
      params.transcriptEntries.length > 0
        ? `Gespräch abgeschlossen nach ${durationLabel}. Es wurden ${params.transcriptEntries.length} Transkriptbeiträge erfasst.`
        : `Gespräch abgeschlossen nach ${durationLabel}. Es liegt kein Transkript vor.`,
    kernproblem: lastLeadMessage
      ? `Letzte Lead-Aussage: "${lastLeadMessage.slice(0, 180)}"`
      : "Kein klares Kernproblem aus dem Transkript erkennbar.",
    naechste_schritte:
      empfehlung === "hot_lead"
        ? "Sofortiges Follow-up mit konkretem Demo-Termin und Angebot versenden."
        : empfehlung === "follow_up"
        ? "Rückfrage zu offenen Punkten und erneutes Qualifizierungsgespräch planen."
        : "Lead in Nurturing-Strecke überführen und später erneut qualifizieren.",
    einschaetzung:
      empfehlung === "hot_lead"
        ? "Hohe Abschlusschance basierend auf aktuellem Gesprächsverlauf."
        : empfehlung === "follow_up"
        ? "Mittlere Abschlusschance; weitere Klärung nötig."
        : "Aktuell geringe Abschlusschance.",
    empfehlung,
  };
}

function normalizeSummary(raw: unknown, fallback: SummaryData): SummaryData {
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Record<string, unknown>;

  const empfehlungRaw = value.empfehlung;
  const empfehlung: Empfehlung =
    empfehlungRaw === "hot_lead" ||
    empfehlungRaw === "follow_up" ||
    empfehlungRaw === "nicht_qualifiziert"
      ? empfehlungRaw
      : fallback.empfehlung;

  return {
    zusammenfassung:
      typeof value.zusammenfassung === "string" && value.zusammenfassung.trim()
        ? value.zusammenfassung.trim()
        : fallback.zusammenfassung,
    kernproblem:
      typeof value.kernproblem === "string" ? value.kernproblem.trim() : fallback.kernproblem,
    naechste_schritte:
      typeof value.naechste_schritte === "string"
        ? value.naechste_schritte.trim()
        : fallback.naechste_schritte,
    einschaetzung:
      typeof value.einschaetzung === "string"
        ? value.einschaetzung.trim()
        : fallback.einschaetzung,
    empfehlung,
  };
}

function saveSummary(vapiCallId: string, summary: string) {
  const db = getDb();
  db.prepare(
    `UPDATE calls
     SET summary = ?
     WHERE vapi_call_id = ?`
  ).run(summary, vapiCallId);
}

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as SummarizePayload;

  const vapiCallId =
    typeof payload.vapi_call_id === "string" ? payload.vapi_call_id : undefined;
  const transcriptEntries = normalizeTranscript(payload.transcript);
  const transcriptText = transcriptToText(transcriptEntries);

  const qualification =
    payload.qualification && typeof payload.qualification === "object"
      ? (payload.qualification as Record<string, unknown>)
      : {};

  const leadScoreInput = payload.lead_score ?? null;
  const leadScore: "A" | "B" | "C" | null = isLeadScore(leadScoreInput)
    ? leadScoreInput
    : null;

  const durationSeconds = Math.max(
    0,
    Number.isFinite(payload.duration_seconds) ? Math.floor(payload.duration_seconds || 0) : 0
  );

  const fallbackSummary = buildFallbackSummary({
    leadScore,
    durationSeconds,
    transcriptEntries,
  });

  // Browser-Flow robust machen: Call immer persistieren, auch ohne LEAD_DATA oder ohne Anthropic-Key.
  if (vapiCallId) {
    const db = getDb();
    const qualificationComplete = hasQualificationData(qualification) ? 1 : 0;

    db.prepare(
      `INSERT OR IGNORE INTO calls (vapi_call_id, drop_off_stage)
       VALUES (?, 'greeting')`
    ).run(vapiCallId);

    db.prepare(
      `UPDATE calls
       SET ended_at = CURRENT_TIMESTAMP,
           duration_seconds = COALESCE(NULLIF(duration_seconds, 0), ?),
           transcript = COALESCE(NULLIF(transcript, ''), ?),
           lead_score = COALESCE(?, lead_score),
           drop_off_stage = CASE
             WHEN appointment_booked = 1 THEN 'booked'
             WHEN ? = 1 THEN 'booking'
             WHEN drop_off_stage IN ('greeting', 'discovery') THEN 'discovery'
             ELSE drop_off_stage
           END
       WHERE vapi_call_id = ?`
    ).run(durationSeconds, transcriptText || null, leadScore, qualificationComplete, vapiCallId);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (vapiCallId) saveSummary(vapiCallId, fallbackSummary.zusammenfassung);
    return NextResponse.json({
      summary: fallbackSummary,
      success: true,
      warning: "ANTHROPIC_API_KEY nicht konfiguriert, Fallback-Summary verwendet.",
    });
  }

  const client = new Anthropic({ apiKey });
  const qualText = JSON.stringify(qualification, null, 2);
  const durationMin = Math.floor(durationSeconds / 60);
  const durationSec = durationSeconds % 60;

  const prompt = `Du bist ein CRM-Analyst. Analysiere dieses Vertriebsgespräch und erstelle eine strukturierte Auswertung.

GESPRÄCHSTRANSKRIPT:
${transcriptText || "(kein Transkript)"}

QUALIFIZIERUNGSDATEN:
${qualText}

LEAD SCORE: ${leadScore || "nicht ermittelt"}
GESPRÄCHSDAUER: ${durationMin}m ${durationSec}s

Erstelle eine JSON-Auswertung mit diesem exakten Format:
{
  "zusammenfassung": "2-3 Sätze über den Gesprächsverlauf und das Ergebnis",
  "kernproblem": "Das wichtigste Problem oder Bedürfnis des Leads in einem Satz",
  "naechste_schritte": "Konkrete nächste Schritte für das Vertriebsteam",
  "einschaetzung": "Kurze professionelle Einschätzung der Verkaufschance",
  "empfehlung": "hot_lead"
}

Für "empfehlung" wähle: "hot_lead" (Score A, Entscheider, sofort), "follow_up" (Score B, weiteres Gespräch nötig), oder "nicht_qualifiziert" (Score C, kein Interesse/Budget).

Antworte NUR mit dem JSON-Objekt, ohne Markdown-Code-Blöcke.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = (message.content as Array<{ text?: string }>)
      .map((part) => part.text || "")
      .join("\n")
      .trim();

    let parsed: unknown = null;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      parsed = null;
    }

    const structured = normalizeSummary(parsed, fallbackSummary);
    if (vapiCallId) saveSummary(vapiCallId, structured.zusammenfassung);
    return NextResponse.json({ summary: structured, success: true });
  } catch {
    if (vapiCallId) saveSummary(vapiCallId, fallbackSummary.zusammenfassung);
    return NextResponse.json({
      summary: fallbackSummary,
      success: true,
      warning: "Anthropic-Anfrage fehlgeschlagen, Fallback-Summary verwendet.",
    });
  }
}
