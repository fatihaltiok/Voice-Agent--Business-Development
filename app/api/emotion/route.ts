import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const FALLBACK = { emotion: "Neutral", intensity: 0.5, coaching_needed: false };

export async function POST(req: NextRequest) {
  const { lead_message, context_messages } = await req.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !lead_message) return NextResponse.json(FALLBACK);

  const client = new Anthropic({ apiKey });

  const contextText = ((context_messages || []) as { role: string; text: string }[])
    .slice(-6)
    .map((m) => `${m.role === "assistant" ? "Sarah" : "Lead"}: ${m.text}`)
    .join("\n");

  const prompt = `Du bist Experte für Gesprächsanalyse im B2B-Vertrieb. Analysiere die EMOTIONALE REAKTION des Leads — sei feinfühlig für subtile Signale. Im Zweifel NICHT "Neutral" wählen.

GESPRÄCHSVERLAUF:
${contextText}

ZU ANALYSIERENDE AUSSAGE: "${lead_message}"

---
EMOTIONSKATEGORIEN MIT DEUTSCHEN SPRACHMUSTERN:

**Enthusiastisch** (intensity 0.7–1.0):
- Starke Zustimmung: "Das ist genau was ich brauche!", "Perfekt!", "Ja, definitiv!"
- Spontane Rückfragen zu Implementierung/Start: "Wann könnten wir anfangen?"
- Mehrere Details positiv kommentiert in einem Satz

**Interessiert** (intensity 0.4–0.8):
- Konkrete Fragen: "Wie genau funktioniert das?", "Was kostet das?", "Wie lange dauert die Einrichtung?"
- Bezieht Lösung auf eigene Situation: "Bei uns wäre das...", "Wir haben da tatsächlich..."
- Aktive Mitarbeit im Gespräch, stellt Nachfragen

**Skeptisch** (intensity 0.4–0.9) — HÄUFIGSTE KATEGORIE, oft unterschätzt:
- Relativieren: "Mal sehen", "Ich weiß nicht so recht", "Naja", "Eigentlich", "Vielleicht"
- Ausweichen: "Das müsste ich erst prüfen", "Muss ich intern besprechen"
- Zögerliche Zustimmung: "Klingt... interessant" (Pause im Text durch "...")
- Kurze Antwort (< 6 Wörter) nach einer ausführlichen Erklärung von Sarah → fast immer Skeptisch
- Passives "Ja", "Ok", "Verstehe" ohne eigene Weiterführung = Skeptisch (0.4–0.6)
- Frühere Misserfolge: "Wir haben sowas schon mal versucht", "Das haben wir auch schon gehört"
- Preisthema ohne konkretes Interesse: "Was kostet das denn?" als Abwehr, nicht als Kaufsignal

**Besorgt** (intensity 0.5–0.9):
- Risiken ansprechen: "Was wenn das nicht klappt?", "Und der Datenschutz?", "Was bei Kündigung?"
- Nach Garantien fragen: "Gibt es da Referenzen?", "Kann man das testen?"
- Unsicherheit über interne Akzeptanz: "Ich weiß nicht ob das mein Team mitmacht"

**Ablehnend** (intensity 0.6–1.0):
- Direkte Ablehnung: "Das ist nichts für uns", "Kein Interesse", "Das brauchen wir nicht"
- Harte Preisaussage als Abbruch: "Das ist viel zu teuer", "Dafür haben wir kein Budget"
- Zeitabwehr: "Dafür haben wir gerade keine Zeit", "Ich muss jetzt leider..."

**Neutral** — NUR wenn wirklich keine emotionale Färbung erkennbar:
- Rein informative Aussagen ohne Wertung
- Bestätigung von Fakten: "Ja wir haben 45 Mitarbeiter"

---
INTENSITÄTS-KALIBRIERUNG:
- Sehr kurze Antwort (1-3 Wörter) nach Sarah-Frage = intensity mindestens 0.5 für Skeptisch
- Je aktiver und detaillierter die Antwort bei pos. Emotion = höhere intensity
- Je direkter die Ablehnung = höhere intensity

coaching_needed = true wenn:
- Emotion ist Skeptisch/Besorgt/Ablehnend UND intensity >= 0.4
- Oder: Antwort ist auffällig kurz/ausweichend nach einer längeren Erklärung

coaching_hint — spezifisch und umsetzbar für Sarah (nur wenn coaching_needed=true):
- Bei Skeptisch: Welchen konkreten Einwand ansprechen
- Bei Besorgt: Welche Sorge direkt aufgreifen
- Bei Ablehnend: Ob weiterführen oder freundlich beenden

Antworte NUR mit JSON (kein Markdown, keine Erklärung):
{"emotion":"...","intensity":0.0,"coaching_needed":false,"coaching_hint":""}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();

    // JSON aus der Antwort extrahieren (falls doch Markdown dabei)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

    const validEmotions = ["Interessiert", "Enthusiastisch", "Neutral", "Skeptisch", "Besorgt", "Ablehnend"];
    if (!validEmotions.includes(result.emotion)) result.emotion = "Neutral";
    result.intensity = Math.max(0, Math.min(1, Number(result.intensity) || 0.5));
    result.coaching_needed = Boolean(result.coaching_needed);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
