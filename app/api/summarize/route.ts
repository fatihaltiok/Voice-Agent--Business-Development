import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { vapi_call_id, transcript, qualification, lead_score, duration_seconds } =
    await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY nicht konfiguriert", success: false },
      { status: 500 }
    );
  }

  const client = new Anthropic({ apiKey });

  const transcriptText = (transcript as { role: string; text: string }[])
    .map((e) => `${e.role === "assistant" ? "Sarah" : "Lead"}: ${e.text}`)
    .join("\n");

  const qualText = JSON.stringify(qualification || {}, null, 2);
  const durationMin = Math.floor((duration_seconds || 0) / 60);
  const durationSec = (duration_seconds || 0) % 60;

  const prompt = `Du bist ein CRM-Analyst. Analysiere dieses Vertriebsgespräch und erstelle eine strukturierte Auswertung.

GESPRÄCHSTRANSKRIPT:
${transcriptText || "(kein Transkript)"}

QUALIFIZIERUNGSDATEN:
${qualText}

LEAD SCORE: ${lead_score || "nicht ermittelt"}
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

    const text = (message.content[0] as { type: string; text: string }).text.trim();

    let structured;
    try {
      structured = JSON.parse(text);
    } catch {
      structured = {
        zusammenfassung: text,
        kernproblem: "",
        naechste_schritte: "",
        einschaetzung: "",
        empfehlung: "follow_up" as const,
      };
    }

    // Summary in DB speichern
    if (vapi_call_id) {
      try {
        const db = getDb();
        db.prepare(
          `UPDATE calls
           SET summary = ?, ended_at = CURRENT_TIMESTAMP, duration_seconds = COALESCE(NULLIF(duration_seconds, 0), ?)
           WHERE vapi_call_id = ?`
        ).run(structured.zusammenfassung || text, duration_seconds || 0, vapi_call_id);
      } catch { /* DB-Fehler nicht propagieren */ }
    }

    return NextResponse.json({ summary: structured, success: true });
  } catch (e) {
    console.error("Summarize error:", e);
    return NextResponse.json({ error: String(e), success: false }, { status: 500 });
  }
}
