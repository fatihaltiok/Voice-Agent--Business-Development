"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, Clock, Phone, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import type { DashboardData, CallWithLeadData } from "@/app/lib/types";

const STAGE_LABELS: Record<string, string> = {
  booked: "Termin gebucht",
  booking: "Terminangebot",
  qualification: "Qualifizierung",
  objection: "Einwand",
  discovery: "Bedarf-Analyse",
  greeting: "Begrüßung",
};

const STAGE_ORDER = ["booked", "booking", "qualification", "objection", "discovery", "greeting"];

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")} min`;
}

function ScoreBadge({ score }: { score: string }) {
  const colors: Record<string, string> = {
    A: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    B: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    C: "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
        colors[score] || "bg-gray-500/20 text-gray-300 border-gray-500/30"
      }`}
    >
      {score}
    </span>
  );
}

function KPICard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="glass-panel glass-border rounded-xl p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-gray-400 text-xs">{label}</p>
        <p className="text-white text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

interface DashboardPanelProps {
  refreshTrigger?: number;
}

export default function DashboardPanel({ refreshTrigger }: DashboardPanelProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallWithLeadData | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const json = await res.json();
      setData(json);
    } catch {
      // Fehler still behandeln
    }
  }, []);

  // Demo-Daten initialisieren
  const seedData = useCallback(async () => {
    if (seeded) return;
    const res = await fetch("/api/seed", { method: "POST" });
    if (res.ok) {
      setSeeded(true);
      await fetchDashboard();
    }
  }, [seeded, fetchDashboard]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, refreshTrigger]);

  // Automatisches Polling alle 15 Sekunden
  useEffect(() => {
    const interval = setInterval(fetchDashboard, 15000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  // Funnel-Daten aufbereiten
  const maxFunnelCount = data
    ? Math.max(...STAGE_ORDER.map((s) => {
        const stat = data.drop_off_stats.find((d) => d.stage === s);
        return stat?.count || 0;
      }), 1)
    : 1;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Lade Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <KPICard
          label="Conversion Rate"
          value={`${data.conversion_rate}%`}
          sub={`${data.booked_calls} von ${data.total_calls} Calls`}
          icon={<TrendingUp className="w-4 h-4 text-emerald-300" />}
          color="bg-emerald-500/10"
        />
        <KPICard
          label="Ø Gesprächsdauer"
          value={formatDuration(data.avg_duration_seconds)}
          sub="bis zur Buchung"
          icon={<Clock className="w-4 h-4 text-blue-300" />}
          color="bg-blue-500/10"
        />
        <KPICard
          label="Gesamt Calls"
          value={String(data.total_calls)}
          sub={`${data.score_a} × A | ${data.score_b} × B | ${data.score_c} × C`}
          icon={<Phone className="w-4 h-4 text-purple-300" />}
          color="bg-purple-500/10"
        />
        <div className="glass-panel glass-border rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-2">Lead-Score Verteilung</p>
          <div className="space-y-1.5">
            {[
              { label: "A – Hot", count: data.score_a, color: "bg-emerald-500" },
              { label: "B – Warm", count: data.score_b, color: "bg-yellow-500" },
              { label: "C – Cold", count: data.score_c, color: "bg-red-500" },
            ].map(({ label, count, color }) => {
              const pct =
                data.total_calls > 0
                  ? Math.round((count / data.total_calls) * 100)
                  : 0;
              return (
                <div key={label} className="flex items-center gap-2">
                  <p className="text-gray-400 text-xs w-16 shrink-0">{label}</p>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all duration-700`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-white text-xs w-6 text-right">{count}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Drop-off Funnel */}
      <div className="glass-panel glass-border rounded-2xl p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">
          Gesprächs-Funnel
        </p>
        <div className="space-y-2">
          {STAGE_ORDER.map((stage) => {
            const stat = data.drop_off_stats.find((d) => d.stage === stage);
            const count = stat?.count || 0;
            const pct = Math.round((count / maxFunnelCount) * 100);
            const isSuccess = stage === "booked";

            return (
              <div key={stage} className="flex items-center gap-3">
                <p
                  className={`text-xs w-28 shrink-0 ${
                    isSuccess ? "text-emerald-400" : "text-gray-400"
                  }`}
                >
                  {STAGE_LABELS[stage] || stage}
                </p>
                <div className="flex-1 h-5 bg-white/5 rounded-lg overflow-hidden relative">
                  <div
                    className={`h-full rounded-lg transition-all duration-700 ${
                      isSuccess
                        ? "bg-emerald-500/40"
                        : "bg-purple-500/30"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className={`text-xs w-5 text-right font-mono ${
                  isSuccess ? "text-emerald-400" : "text-gray-300"
                }`}>
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Letzte Anrufe */}
      <div className="glass-panel glass-border rounded-2xl p-4 flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-400 text-xs uppercase tracking-wider">
            Letzte Anrufe
          </p>
          {data.total_calls === 0 && (
            <button
              onClick={seedData}
              className="glass-button px-3 py-1 rounded-lg text-purple-300 text-xs"
            >
              Demo-Daten laden
            </button>
          )}
        </div>

        {data.total_calls === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-6">
            Noch keine Anrufe. Starte ein Gespräch oder lade Demo-Daten.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {data.recent_calls.map((call) => (
              <div key={call.id}>
                <button
                  onClick={() =>
                    setSelectedCall(selectedCall?.id === call.id ? null : call)
                  }
                  className="w-full glass-button rounded-xl px-3 py-2.5 flex items-center gap-3 text-left hover:border-purple-500/30 transition-all"
                >
                  {call.appointment_booked ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {call.lead_name || "Unbekannter Lead"}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {call.company_size || "—"} ·{" "}
                      {formatDuration(call.duration_seconds)}
                    </p>
                  </div>
                  <ScoreBadge score={call.lead_score} />
                  <ChevronRight
                    className={`w-4 h-4 text-gray-500 transition-transform ${
                      selectedCall?.id === call.id ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {/* Detail-Ansicht */}
                {selectedCall?.id === call.id && (
                  <div className="mt-1 ml-7 glass-panel rounded-xl p-3 border border-purple-500/10 space-y-1.5">
                    {call.pain_point && (
                      <p className="text-gray-300 text-xs">
                        <span className="text-gray-500">Problem:</span>{" "}
                        {call.pain_point}
                      </p>
                    )}
                    {call.budget && (
                      <p className="text-gray-300 text-xs">
                        <span className="text-gray-500">Budget:</span>{" "}
                        {call.budget}
                      </p>
                    )}
                    {call.timeline && (
                      <p className="text-gray-300 text-xs">
                        <span className="text-gray-500">Zeitplan:</span>{" "}
                        {call.timeline}
                      </p>
                    )}
                    {call.appointment_booked && call.appointment_time && (
                      <p className="text-emerald-400 text-xs">
                        Termin:{" "}
                        {new Date(call.appointment_time).toLocaleString(
                          "de-DE",
                          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
                        )}
                      </p>
                    )}
                    {call.summary && (
                      <p className="text-gray-400 text-xs border-t border-white/5 pt-1.5 mt-1.5">
                        {call.summary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
