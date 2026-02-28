"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import AgentPanel from "./components/AgentPanel";
import DashboardPanel from "./components/DashboardPanel";

export default function Home() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCallEnded = () => {
    // Dashboard nach Gespräch aktualisieren
    setTimeout(() => setRefreshTrigger((n) => n + 1), 1500);
  };

  return (
    <div className="min-h-screen piano-black-surface flex flex-col">
      {/* Header */}
      <header className="glass-panel glass-border border-b border-white/10 shrink-0">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 glass-button rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-300" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-none">
                FlowAI Voice Agent
              </h1>
              <p className="text-gray-400 text-xs mt-0.5">
                B2B Sales Intelligence — Sarah
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-gray-500 text-xs">SaaS-Produkt</p>
              <p className="text-purple-300 text-xs font-medium">
                FlowAI CRM Automation
              </p>
            </div>
            <a
              href="https://vapi.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="glass-button px-3 py-1.5 rounded-lg text-gray-300 text-xs"
            >
              Powered by VAPI
            </a>
          </div>
        </div>
      </header>

      {/* Split-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Linke Seite: Agent (40%) */}
        <div className="w-[42%] border-r border-white/10 p-5 overflow-y-auto flex flex-col">
          <div className="mb-3">
            <h2 className="text-white font-semibold text-sm">Agent</h2>
            <p className="text-gray-500 text-xs">
              Starte ein Gespräch — Sarah qualifiziert den Lead automatisch
            </p>
          </div>
          <div className="flex-1">
            <AgentPanel onCallEnded={handleCallEnded} />
          </div>
        </div>

        {/* Rechte Seite: Dashboard (58%) */}
        <div className="flex-1 p-5 overflow-y-auto flex flex-col">
          <div className="mb-3">
            <h2 className="text-white font-semibold text-sm">Dashboard</h2>
            <p className="text-gray-500 text-xs">
              Echtzeit-KPIs — aktualisiert nach jedem Gespräch
            </p>
          </div>
          <div className="flex-1">
            <DashboardPanel refreshTrigger={refreshTrigger} />
          </div>
        </div>
      </div>
    </div>
  );
}
