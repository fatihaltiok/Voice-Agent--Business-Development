"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, PhoneOff, Loader2, CheckCircle2, Clock, Users, Wallet, Calendar, Target } from "lucide-react";

type CallStatus = "idle" | "connecting" | "active" | "ended";

type EmotionLabel = "Interessiert" | "Enthusiastisch" | "Neutral" | "Skeptisch" | "Besorgt" | "Ablehnend";

interface EmotionResult {
  emotion: EmotionLabel;
  intensity: number;
  coaching_needed: boolean;
  coaching_hint?: string;
}

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

interface QualificationState {
  company_size?: string;
  budget?: string;
  is_decision_maker?: boolean;
  timeline?: string;
  pain_point?: string;
  lead_name?: string;
  lead_email?: string;
}

interface SummaryData {
  zusammenfassung: string;
  kernproblem: string;
  naechste_schritte: string;
  einschaetzung: string;
  empfehlung: "hot_lead" | "follow_up" | "nicht_qualifiziert";
}

interface BookingDetails {
  time?: string;
  url?: string;
  message?: string;
}

interface AgentPanelProps {
  onCallEnded?: () => void;
}

const SARAH_FIRST_MESSAGE =
  "Hallo! Ich bin Sarah von FlowAI. Sie haben kürzlich unsere Case Study über Lead-Reaktivierung gelesen – herzlichen Glückwunsch zur Initiative! Ich rufe kurz an, um zu sehen, ob das auch für Sie relevante Einblicke hatte. Haben Sie zwei Minuten?";

const SARAH_SYSTEM_PROMPT = `Du bist Sarah, eine erfahrene Business Development Managerin bei FlowAI, einer KI-gestützten Vertriebsautomatisierungsplattform für B2B-Unternehmen.

KONTEXT — Was du verkaufst:
FlowAI automatisiert den kompletten Lead-Reaktivierungs-Prozess:
CRM-Datenbank → KI-Voice-Agent ruft schlafende Leads an → Qualifizierter Demo-Termin → Umsatz.

Bewiesene Ergebnisse aus unserer Case Study (Kunde: Dimitri):
- 167.000€ zusätzlicher Monatsumsatz durch reaktivierte Leads
- 14x ROI innerhalb des ersten Quartals
- 0 zusätzliche Mitarbeiter nötig — vollautomatisch, 24/7
- Leads, die jahrelang "tot" schienen, wurden zu zahlenden Kunden

Nutze diese Zahlen natürlich im Gespräch, wenn es passt — nicht als Skript, sondern als Gesprächspunkte.

DEINE AUFGABE:
Führe ein natürliches Erstgespräch mit einem Lead, der unsere Case Study gelesen hat. Qualifiziere den Lead nach 4 Kriterien und vereinbare wenn möglich einen Demo-Termin.

Qualifiziere diese 4 Kriterien im Gespräch:
1. Unternehmensgröße / Mitarbeiteranzahl
2. Budget (monatlicher Investitionsrahmen)
3. Entscheidungsbefugnis (bist du der finale Entscheider?)
4. Zeitplan (wann wollt ihr starten?)

Typische Pain Points ansprechen falls passend:
- "Habt ihr noch Leads im CRM, die nie konvertiert sind?"
- "Wie viele potenzielle Kunden gehen euch durch manuelle Nachverfolgung verloren?"
- "Was würde es bedeuten, wenn 10% eurer schlafenden Leads reaktiviert würden?"

Wenn du alle 4 Kriterien erfasst hast, gib EINMALIG am Ende einer Antwort diesen Block aus (unsichtbar für den Lead, nur für System):
LEAD_DATA:{"company_size":"...","budget":"...","is_decision_maker":true,"timeline":"...","pain_point":"...","lead_name":"..."}

Wenn der Lead einem Demo-Termin zustimmt, gib aus:
BOOKING:{"confirmed":true,"lead_name":"...","lead_email":"..."}

Wenn du einen Coaching-Hinweis erhältst (z.B. "[Coaching-Hinweis: ...]"), reagiere subtil darauf ohne es zu erwähnen.

Regeln: Kein starres Skript. Stelle Fragen, hör zu, reagiere auf das Gesagte. Nicht mehr als 2-3 Sätze pro Antwort. Sprache: Deutsch, professionell aber herzlich.`;

// Emotion-Konfiguration
const EMOTION_CONFIG: Record<EmotionLabel, { color: string; bg: string; border: string }> = {
  Interessiert:    { color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  Enthusiastisch:  { color: "text-blue-300",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  Neutral:         { color: "text-gray-400",    bg: "bg-gray-500/10",   border: "border-gray-500/20"    },
  Skeptisch:       { color: "text-yellow-300",  bg: "bg-yellow-500/10", border: "border-yellow-500/20"  },
  Besorgt:         { color: "text-orange-300",  bg: "bg-orange-500/10", border: "border-orange-500/20"  },
  Ablehnend:       { color: "text-red-300",     bg: "bg-red-500/10",    border: "border-red-500/20"     },
};

const POSITIVE_EMOTIONS: EmotionLabel[] = ["Interessiert", "Enthusiastisch"];
const NEGATIVE_EMOTIONS: EmotionLabel[] = ["Skeptisch", "Besorgt", "Ablehnend"];

export default function AgentPanel({ onCallEnded }: AgentPanelProps) {
  const vapiRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const callIdRef = useRef<string>(`web-${Date.now()}`);

  // Refs für aktuelle Werte (stale closure prevention)
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const qualificationRef = useRef<QualificationState>({});
  const leadScoreRef = useRef<string | null>(null);
  const durationRef = useRef(0);
  const lastCoachingRef = useRef<number>(0);
  const negativeStreakRef = useRef<number>(0);
  const emotionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<CallStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [qualification, setQualification] = useState<QualificationState>({});
  const [leadScore, setLeadScore] = useState<string | null>(null);
  const [appointmentBooked, setAppointmentBooked] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [emotions, setEmotions] = useState<Record<number, EmotionResult | "loading">>({});

  // Refs mit State synchron halten
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);
  useEffect(() => { qualificationRef.current = qualification; }, [qualification]);
  useEffect(() => { leadScoreRef.current = leadScore; }, [leadScore]);
  useEffect(() => { durationRef.current = callDuration; }, [callDuration]);

  // Echtzeit-Emotionsanalyse: nach jeder neuen Lead-Nachricht
  useEffect(() => {
    if (status !== "active") return;
    const lastIndex = transcript.length - 1;
    if (lastIndex < 0) return;
    const last = transcript[lastIndex];
    if (last.role !== "user") return;
    if (emotions[lastIndex] !== undefined) return; // bereits analysiert

    // Debounce: 1.2s warten damit Nachricht fertig gesprochen
    if (emotionDebounceRef.current) clearTimeout(emotionDebounceRef.current);
    emotionDebounceRef.current = setTimeout(async () => {
      setEmotions((prev) => ({ ...prev, [lastIndex]: "loading" }));

      try {
        const res = await fetch("/api/emotion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead_message: last.text,
            context_messages: transcriptRef.current.slice(Math.max(0, lastIndex - 4), lastIndex + 1),
          }),
        });
        const result: EmotionResult = await res.json();
        setEmotions((prev) => ({ ...prev, [lastIndex]: result }));

        // Coaching-Logik: bei Skepsis/Ablehnung Sarah informieren
        if (NEGATIVE_EMOTIONS.includes(result.emotion)) {
          negativeStreakRef.current++;
        } else {
          negativeStreakRef.current = 0;
        }

        // Trigger: 1x starke Negativemotion (>=0.65) ODER 2x beliebige Negativemotion
        const strongNegative = result.coaching_needed && result.intensity >= 0.65;
        const repeatedNegative = result.coaching_needed && negativeStreakRef.current >= 2;

        if (strongNegative || repeatedNegative) {
          const now = Date.now();
          if (now - lastCoachingRef.current > 45_000) { // max 1x pro 45s
            lastCoachingRef.current = now;
            negativeStreakRef.current = 0;
            try {
              vapiRef.current?.send({
                type: "add-message",
                message: {
                  role: "system",
                  content: `[Coaching-Hinweis: ${result.coaching_hint || "Geh auf den Einwand des Leads ein, stelle eine offene Frage."}]`,
                },
              });
            } catch { /* VAPI send optional */ }
          }
        }
      } catch {
        // Analyse fehlgeschlagen — Entry entfernen damit es nicht blockiert
        setEmotions((prev) => {
          const next = { ...prev };
          delete next[lastIndex];
          return next;
        });
      }
    }, 1200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, status]);

  // Timer
  useEffect(() => {
    if (status !== "active") return;
    const interval = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Auto-scroll Transkript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Cleanup debounce
  useEffect(() => () => {
    if (emotionDebounceRef.current) clearTimeout(emotionDebounceRef.current);
  }, []);

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  // Gesprächsstimmung aus letzten 3 Emotionen berechnen
  const getMoodTrend = (): "positive" | "neutral" | "negative" => {
    const recent = Object.entries(emotions)
      .filter(([, v]) => v !== "loading")
      .slice(-3)
      .map(([, v]) => v as EmotionResult);
    if (recent.length === 0) return "neutral";
    const pos = recent.filter((e) => POSITIVE_EMOTIONS.includes(e.emotion)).length;
    const neg = recent.filter((e) => NEGATIVE_EMOTIONS.includes(e.emotion)).length;
    if (pos > neg) return "positive";
    if (neg > pos) return "negative";
    return "neutral";
  };

  const startCall = async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setError("NEXT_PUBLIC_VAPI_PUBLIC_KEY fehlt in .env.local — bitte konfigurieren.");
      return;
    }

    setError(null);
    setTranscript([]);
    setQualification({});
    setLeadScore(null);
    setAppointmentBooked(false);
    setCallDuration(0);
    setSummary(null);
    setSummaryLoading(false);
    setBookingDetails(null);
    setEmotions({});
    negativeStreakRef.current = 0;
    lastCoachingRef.current = 0;
    callIdRef.current = `web-${Date.now()}`;

    const { default: Vapi } = await import("@vapi-ai/web");
    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setStatus("active");
      fetch("/api/call-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vapi_call_id: callIdRef.current }),
      }).catch(() => {
        // Nicht blockieren; /api/summarize macht zusätzlich ein Upsert
      });
    });

    vapi.on("call-end", () => {
      setStatus("ended");
      onCallEnded?.();
      setSummaryLoading(true);
      fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vapi_call_id: callIdRef.current,
          transcript: transcriptRef.current,
          qualification: qualificationRef.current,
          lead_score: leadScoreRef.current,
          duration_seconds: durationRef.current,
        }),
      })
        .then((r) => r.json())
        .then((d) => { if (d.success) setSummary(d.summary); })
        .catch(() => {})
        .finally(() => setSummaryLoading(false));
    });

    vapi.on("speech-start", () => setIsSpeaking(true));
    vapi.on("speech-end", () => setIsSpeaking(false));
    vapi.on("volume-level", (level: number) => setVolumeLevel(level));

    vapi.on("message", async (msg: any) => {
      if (msg.type === "transcript" && msg.transcriptType === "final") {
        const text: string = msg.transcript || "";

        const cleanText = text
          .replace(/LEAD_DATA:\{[^}]+\}/g, "")
          .replace(/BOOKING:\{[^}]+\}/g, "")
          .trim();

        const leadMatch = text.match(/LEAD_DATA:(\{[^}]+\})/);
        if (leadMatch) {
          try {
            const data = JSON.parse(leadMatch[1]);
            setQualification(data);
            fetch("/api/qualify-lead", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...data, vapi_call_id: callIdRef.current }),
            })
              .then((r) => r.json())
              .then((d) => setLeadScore(d.lead_score));
          } catch { /* ignorieren */ }
        }

        const bookingMatch = text.match(/BOOKING:(\{[^}]+\})/);
        if (bookingMatch) {
          try {
            const data = JSON.parse(bookingMatch[1]);
            if (data.confirmed) {
              fetch("/api/book-demo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...data, vapi_call_id: callIdRef.current }),
              })
                .then((r) => r.json())
                .then((d) => {
                  if (d.success) {
                    setAppointmentBooked(true);
                    setBookingDetails({ time: d.start_time, url: d.booking_url, message: d.message });
                  }
                });
            }
          } catch { /* ignorieren */ }
        }

        if (!cleanText) return;

        setTranscript((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role === msg.role) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              text: updated[updated.length - 1].text + " " + cleanText,
            };
            return updated;
          }
          return [...prev, { role: msg.role, text: cleanText }];
        });
      }
    });

    vapi.on("error", (e: any) => {
      console.error("VAPI Error raw:", JSON.stringify(e));
      const msg = e?.message || e?.error?.message || e?.errorMsg || JSON.stringify(e);
      if (msg && msg !== "{}") {
        setError(`VAPI Fehler: ${msg}`);
      } else {
        setError("Verbindung fehlgeschlagen. Provider-Key in VAPI Dashboard prüfen.");
      }
      setStatus("idle");
    });

    setStatus("connecting");

    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
    if (assistantId) {
      await vapi.start(assistantId);
    } else {
      await vapi.start({
        name: "Sarah",
        firstMessage: SARAH_FIRST_MESSAGE,
        transcriber: { provider: "deepgram", model: "nova-2", language: "de" },
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          systemPrompt: SARAH_SYSTEM_PROMPT,
          temperature: 0.7,
          maxTokens: 512,
        },
        voice: { provider: "inworld", voiceId: "Johanna" },
      } as any);
    }
  };

  const endCall = () => {
    vapiRef.current?.stop();
    setStatus("ended");
  };

  const scoreColor = {
    A: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    B: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
    C: "text-red-400 border-red-500/40 bg-red-500/10",
  };

  const qualCriteria = [
    { key: "company_size", label: "Unternehmensgröße", icon: <Users className="w-3 h-3" />, value: qualification.company_size },
    { key: "budget", label: "Budget", icon: <Wallet className="w-3 h-3" />, value: qualification.budget },
    {
      key: "is_decision_maker", label: "Entscheider", icon: <Target className="w-3 h-3" />,
      value: qualification.is_decision_maker !== undefined ? (qualification.is_decision_maker ? "Ja" : "Nein") : undefined,
    },
    { key: "timeline", label: "Zeitplan", icon: <Calendar className="w-3 h-3" />, value: qualification.timeline },
  ];

  const empfehlungLabel = (e: SummaryData["empfehlung"]) =>
    e === "hot_lead" ? "Hot Lead" : e === "follow_up" ? "Follow-up" : "Nicht qualifiziert";

  const empfehlungStyle = (e: SummaryData["empfehlung"]) =>
    e === "hot_lead"
      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
      : e === "follow_up"
      ? "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30"
      : "bg-gray-500/15 text-gray-400 border border-gray-500/30";

  const moodTrend = getMoodTrend();
  const emotionCount = Object.values(emotions).filter((v) => v !== "loading").length;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="glass-panel glass-border rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              status === "active"
                ? "bg-red-500 animate-pulse"
                : status === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : status === "ended"
                ? "bg-gray-500"
                : "bg-emerald-500"
            }`}
          />
          <div>
            <p className="text-white font-semibold text-sm">
              {status === "active" ? "Gespräch aktiv" : status === "connecting" ? "Verbinde..." : status === "ended" ? "Gespräch beendet" : "Sarah ist bereit"}
            </p>
            {status === "active" && (
              <p className="text-gray-400 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(callDuration)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Gesprächsstimmung */}
          {status === "active" && emotionCount > 0 && (
            <div
              className={`text-xs px-2 py-0.5 rounded-full border ${
                moodTrend === "positive"
                  ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                  : moodTrend === "negative"
                  ? "text-yellow-300 border-yellow-500/30 bg-yellow-500/10"
                  : "text-gray-400 border-gray-500/30 bg-gray-500/10"
              }`}
            >
              {moodTrend === "positive" ? "↑" : moodTrend === "negative" ? "↓" : "→"} Stimmung
            </div>
          )}

          {leadScore && (
            <div className={`px-3 py-1 rounded-full border text-xs font-bold ${scoreColor[leadScore as keyof typeof scoreColor]}`}>
              Score {leadScore}
            </div>
          )}

          {appointmentBooked && (
            <div className="flex items-center gap-1 text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4" />
              Termin gebucht!
            </div>
          )}
        </div>
      </div>

      {/* Transkript */}
      <div className="glass-panel glass-border rounded-2xl p-4 flex-1 overflow-hidden flex flex-col min-h-0">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Live-Transkript</p>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {transcript.length === 0 && status === "idle" && (
            <p className="text-gray-500 text-sm text-center mt-8">
              Starte ein Gespräch um den Live-Transkript zu sehen
            </p>
          )}
          {transcript.length === 0 && status === "active" && (
            <p className="text-gray-500 text-sm text-center mt-8 animate-pulse">Warte auf Sprache...</p>
          )}
          {transcript.map((entry, i) => {
            const emotion = entry.role === "user" ? emotions[i] : undefined;
            const emotionData = emotion && emotion !== "loading" ? (emotion as EmotionResult) : null;
            const cfg = emotionData ? EMOTION_CONFIG[emotionData.emotion] : null;

            return (
              <div key={i} className={`flex ${entry.role === "assistant" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    entry.role === "assistant"
                      ? "bg-purple-900/30 border border-purple-500/20 text-purple-100"
                      : "bg-white/5 border border-white/10 text-gray-200"
                  }`}
                >
                  <p className="text-xs mb-1 opacity-60">
                    {entry.role === "assistant" ? "Sarah" : "Lead"}
                  </p>
                  {entry.text}

                  {/* Emotion-Badge für Lead-Nachrichten */}
                  {entry.role === "user" && (
                    <div className="mt-1.5">
                      {emotion === "loading" ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          analysiert
                        </span>
                      ) : cfg ? (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${cfg.color} ${cfg.bg} ${cfg.border}`}
                          title={`Intensität: ${Math.round(emotionData!.intensity * 100)}%`}
                        >
                          {emotionData!.emotion}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Qualifizierung während Call — Call-Auswertung nach Ende */}
      {status === "ended" ? (
        <div className="glass-panel glass-border rounded-2xl p-4">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Call-Auswertung</p>
          {summaryLoading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              KI-Auswertung wird erstellt...
            </div>
          ) : summary ? (
            <div className="space-y-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${empfehlungStyle(summary.empfehlung)}`}>
                {empfehlungLabel(summary.empfehlung)}
              </span>
              <p className="text-gray-300 text-xs leading-relaxed">{summary.zusammenfassung}</p>
              {summary.kernproblem && (
                <p className="text-xs">
                  <span className="text-gray-500">Kernproblem: </span>
                  <span className="text-gray-300">{summary.kernproblem}</span>
                </p>
              )}
              {summary.naechste_schritte && (
                <p className="text-xs">
                  <span className="text-gray-500">Nächste Schritte: </span>
                  <span className="text-gray-300">{summary.naechste_schritte}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-xs">Keine Auswertung verfügbar. (ANTHROPIC_API_KEY prüfen)</p>
          )}
        </div>
      ) : (
        <div className="glass-panel glass-border rounded-2xl p-4">
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">Lead-Qualifizierung</p>
          <div className="grid grid-cols-2 gap-2">
            {qualCriteria.map((c) => (
              <div
                key={c.key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                  c.value ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-white/10 bg-white/3 text-gray-500"
                }`}
              >
                {c.value ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-gray-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.label}</p>
                  {c.value && <p className="text-emerald-400/70 truncate">{c.value}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Termin-Bestätigung */}
      {appointmentBooked && bookingDetails && (
        <div className="glass-panel rounded-2xl p-4 border border-emerald-500/25 bg-emerald-500/5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-emerald-300 text-xs font-semibold uppercase tracking-wider">Demo-Termin bestätigt</p>
          </div>
          {bookingDetails.time && (
            <p className="text-white text-sm font-medium">
              {new Date(bookingDetails.time).toLocaleString("de-DE", {
                weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
              })}{" "}Uhr
            </p>
          )}
          {bookingDetails.message && !bookingDetails.time && (
            <p className="text-gray-300 text-xs">{bookingDetails.message}</p>
          )}
          {bookingDetails.url && bookingDetails.url !== "https://cal.com/demo/confirmed" && (
            <a href={bookingDetails.url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 text-xs underline mt-1 inline-block">
              Im Kalender ansehen
            </a>
          )}
        </div>
      )}

      {/* Fehler */}
      {error && (
        <div className="glass-panel rounded-xl p-3 border border-red-500/30 bg-red-500/5">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {/* Mikrofon-Button */}
      <div className="flex justify-center py-2">
        {status === "idle" || status === "ended" ? (
          <button
            onClick={startCall}
            className="record-button-glass w-28 h-28 rounded-full flex items-center justify-center transition-all"
          >
            <Mic className="w-10 h-10 text-purple-200 drop-shadow-lg relative z-10" />
          </button>
        ) : status === "connecting" ? (
          <div className="w-28 h-28 rounded-full glass-panel glass-border flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-purple-300 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1 h-8">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1 bg-purple-400 rounded-full transition-all duration-100 ${isSpeaking ? "opacity-100" : "opacity-30"}`}
                  style={{ height: isSpeaking ? `${Math.max(8, volumeLevel * 32 + Math.random() * 16)}px` : "8px" }}
                />
              ))}
            </div>
            <button onClick={endCall} className="w-28 h-28 rounded-full flex items-center justify-center jelly-glow-red record-button-glass">
              <PhoneOff className="w-10 h-10 text-red-200 drop-shadow-lg relative z-10" />
            </button>
            <p className="text-gray-400 text-xs">Gespräch beenden</p>
          </div>
        )}
      </div>
    </div>
  );
}
