"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Phone, PhoneOff, Loader2, CheckCircle2, Clock, Users, Wallet, Calendar, Target } from "lucide-react";

type CallStatus = "idle" | "connecting" | "active" | "ended";

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

interface AgentPanelProps {
  onCallEnded?: () => void;
}

const SARAH_FIRST_MESSAGE =
  "Hallo! Ich bin Sarah von FlowAI. Sie haben kürzlich unsere Case Study über Lead-Reaktivierung gelesen – herzlichen Glückwunsch zur Initiative! Ich rufe kurz an, um zu sehen, ob das auch für Sie relevante Einblicke hatte. Haben Sie zwei Minuten?";

const SARAH_SYSTEM_PROMPT = `Du bist Sarah, eine erfahrene Business Development Managerin bei FlowAI, einer KI-gestützten Vertriebsautomatisierungsplattform. Deine Aufgabe: Führe ein natürliches Erstgespräch mit einem Lead, der unsere Case Study über Lead-Reaktivierung gelesen hat. Qualifiziere den Lead (Unternehmensgröße, Budget, Entscheidungsbefugnis, Zeitplan) und buche einen Demo-Termin. Verwende qualifyLead sobald alle 4 Kriterien bekannt sind. Verwende bookDemoAppointment wenn der Lead zustimmt. Keine starren Skripte — reagiere natürlich. Sprache: Deutsch.`;

export default function AgentPanel({ onCallEnded }: AgentPanelProps) {
  const vapiRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const callIdRef = useRef<string>(`web-${Date.now()}`);

  const [status, setStatus] = useState<CallStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [qualification, setQualification] = useState<QualificationState>({});
  const [leadScore, setLeadScore] = useState<string | null>(null);
  const [appointmentBooked, setAppointmentBooked] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const handleToolCall = useCallback(
    async (toolCallList: any[]) => {
      if (!vapiRef.current) return;

      const results: { toolCallId: string; result: string }[] = [];

      for (const toolCall of toolCallList) {
        const { id, function: fn } = toolCall;
        const params =
          typeof fn.arguments === "string"
            ? JSON.parse(fn.arguments)
            : fn.arguments;

        let result = "";

        if (fn.name === "qualifyLead") {
          setQualification(params);

          try {
            const res = await fetch("/api/qualify-lead", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...params,
                vapi_call_id: callIdRef.current,
              }),
            });
            const data = await res.json();
            setLeadScore(data.lead_score);
            result = `Lead qualifiziert. Score: ${data.lead_score}. Kriterien gespeichert.`;
          } catch {
            result = "Lead-Daten erfasst.";
          }
        }

        if (fn.name === "bookDemoAppointment") {
          try {
            const res = await fetch("/api/book-demo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...params,
                vapi_call_id: callIdRef.current,
              }),
            });
            const data = await res.json();
            if (data.success) {
              setAppointmentBooked(true);
              result = `Termin erfolgreich gebucht! ${data.message || ""}`;
            } else {
              result =
                "Entschuldigung, bei der Buchung gab es ein technisches Problem. Ihr Wunschtermin wurde notiert.";
            }
          } catch {
            result = "Termin notiert. Details folgen per E-Mail.";
          }
        }

        results.push({ toolCallId: id, result });
      }

      // Ergebnis an VAPI zurücksenden
      vapiRef.current.send({
        type: "add-message",
        message: {
          role: "tool",
          toolCallId: results[0]?.toolCallId,
          content: results[0]?.result || "",
        },
      });
    },
    []
  );

  const startCall = async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

    if (!publicKey) {
      setError(
        "NEXT_PUBLIC_VAPI_PUBLIC_KEY fehlt in .env.local — bitte konfigurieren."
      );
      return;
    }

    setError(null);
    setTranscript([]);
    setQualification({});
    setLeadScore(null);
    setAppointmentBooked(false);
    setCallDuration(0);
    callIdRef.current = `web-${Date.now()}`;

    const { default: Vapi } = await import("@vapi-ai/web");
    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => setStatus("active"));

    vapi.on("call-end", () => {
      setStatus("ended");
      onCallEnded?.();
    });

    vapi.on("speech-start", () => setIsSpeaking(true));
    vapi.on("speech-end", () => setIsSpeaking(false));
    vapi.on("volume-level", (level: number) => setVolumeLevel(level));

    vapi.on("message", async (msg: any) => {
      if (msg.type === "transcript" && msg.transcriptType === "final") {
        setTranscript((prev) => [
          ...prev,
          { role: msg.role, text: msg.transcript },
        ]);
      }

      if (msg.type === "tool-calls" && msg.toolCallList) {
        await handleToolCall(msg.toolCallList);
      }
    });

    vapi.on("error", (e: any) => {
      console.error("VAPI Error:", e);
      setError(`Fehler: ${e?.message || "Verbindung fehlgeschlagen"}`);
      setStatus("idle");
    });

    setStatus("connecting");

    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

    if (assistantId) {
      // Vorkonfigurierter Assistent
      await vapi.start(assistantId);
    } else {
      // Inline-Konfiguration (kein VAPI-Dashboard nötig)
      await vapi.start({
        name: "Sarah",
        firstMessage: SARAH_FIRST_MESSAGE,
        transcriber: {
          provider: "deepgram",
          model: "nova-2",
          language: "de",
        },
        model: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          systemPrompt: SARAH_SYSTEM_PROMPT,
          temperature: 0.7,
          maxTokens: 512,
          toolIds: [],
        },
        voice: {
          provider: "azure",
          voiceId: "de-DE-KatjaNeural",
        },
        tools: [
          {
            type: "function",
            function: {
              name: "qualifyLead",
              description:
                "Speichere Lead-Daten wenn alle 4 Pflichtkriterien erfasst sind",
              parameters: {
                type: "object" as const,
                properties: {
                  company_size: { type: "string" },
                  budget: { type: "string" },
                  is_decision_maker: { type: "boolean" },
                  timeline: { type: "string" },
                  pain_point: { type: "string" },
                  current_tools: { type: "string" },
                  lead_name: { type: "string" },
                  lead_email: { type: "string" },
                },
                required: [
                  "company_size",
                  "budget",
                  "is_decision_maker",
                  "timeline",
                ],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "bookDemoAppointment",
              description: "Buche einen 30-minütigen Demo-Termin",
              parameters: {
                type: "object" as const,
                properties: {
                  lead_name: { type: "string" },
                  lead_email: { type: "string" },
                  preferred_time: { type: "string" },
                },
                required: ["lead_name", "lead_email"],
              },
            },
          },
        ],
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
    {
      key: "company_size",
      label: "Unternehmensgröße",
      icon: <Users className="w-3 h-3" />,
      value: qualification.company_size,
    },
    {
      key: "budget",
      label: "Budget",
      icon: <Wallet className="w-3 h-3" />,
      value: qualification.budget,
    },
    {
      key: "is_decision_maker",
      label: "Entscheider",
      icon: <Target className="w-3 h-3" />,
      value:
        qualification.is_decision_maker !== undefined
          ? qualification.is_decision_maker
            ? "Ja"
            : "Nein"
          : undefined,
    },
    {
      key: "timeline",
      label: "Zeitplan",
      icon: <Calendar className="w-3 h-3" />,
      value: qualification.timeline,
    },
  ];

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
              {status === "active"
                ? "Gespräch aktiv"
                : status === "connecting"
                ? "Verbinde..."
                : status === "ended"
                ? "Gespräch beendet"
                : "Sarah ist bereit"}
            </p>
            {status === "active" && (
              <p className="text-gray-400 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDuration(callDuration)}
              </p>
            )}
          </div>
        </div>

        {leadScore && (
          <div
            className={`px-3 py-1 rounded-full border text-xs font-bold ${
              scoreColor[leadScore as keyof typeof scoreColor]
            }`}
          >
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

      {/* Transkript */}
      <div className="glass-panel glass-border rounded-2xl p-4 flex-1 overflow-hidden flex flex-col min-h-0">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">
          Live-Transkript
        </p>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {transcript.length === 0 && status === "idle" && (
            <p className="text-gray-500 text-sm text-center mt-8">
              Starte ein Gespräch um den Live-Transkript zu sehen
            </p>
          )}
          {transcript.length === 0 && status === "active" && (
            <p className="text-gray-500 text-sm text-center mt-8 animate-pulse">
              Warte auf Sprache...
            </p>
          )}
          {transcript.map((entry, i) => (
            <div
              key={i}
              className={`flex ${
                entry.role === "assistant" ? "justify-start" : "justify-end"
              }`}
            >
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
              </div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Qualifizierungs-Checkliste */}
      <div className="glass-panel glass-border rounded-2xl p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">
          Lead-Qualifizierung
        </p>
        <div className="grid grid-cols-2 gap-2">
          {qualCriteria.map((c) => (
            <div
              key={c.key}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                c.value
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                  : "border-white/10 bg-white/3 text-gray-500"
              }`}
            >
              {c.value ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-gray-600 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium truncate">{c.label}</p>
                {c.value && (
                  <p className="text-emerald-400/70 truncate">{c.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

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
            {/* Sprechindikator */}
            <div className="flex items-center gap-1 h-8">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1 bg-purple-400 rounded-full transition-all duration-100 ${
                    isSpeaking ? "opacity-100" : "opacity-30"
                  }`}
                  style={{
                    height: isSpeaking
                      ? `${Math.max(8, volumeLevel * 32 + Math.random() * 16)}px`
                      : "8px",
                  }}
                />
              ))}
            </div>
            <button
              onClick={endCall}
              className="w-28 h-28 rounded-full flex items-center justify-center jelly-glow-red record-button-glass"
            >
              <PhoneOff className="w-10 h-10 text-red-200 drop-shadow-lg relative z-10" />
            </button>
            <p className="text-gray-400 text-xs">Gespräch beenden</p>
          </div>
        )}
      </div>
    </div>
  );
}
