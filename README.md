# FlowAI Voice Agent

**KI-Voice-Agent für B2B-Vertrieb** — Everlast Developer Contest 2026

Ein vollständig funktionsfähiger Voice Agent, der B2B-Entscheider für die SaaS-Plattform **FlowAI** berät, Leads qualifiziert und Demo-Termine automatisch bucht.

---

## Demo

> „Würde ein echter Sales-Manager diesem Agent vertrauen, die erste Kontaktaufnahme zu übernehmen?"

Der Agent **Sarah** führt natürliche Erstgespräche, qualifiziert Leads nach 4 Kriterien und bucht Termine — vollautomatisch, 24/7.

---

## Features

| Feature | Details |
|---|---|
| **Voice-in / Voice-out** | Echtzeitgespräch via VAPI Web SDK (< 1.5s Latenz) |
| **Lead-Qualifizierung** | 4 Pflichtkriterien: Größe, Budget, Entscheider, Zeitplan |
| **Lead-Scoring** | Automatischer A/B/C-Score nach gewichtetem Algorithmus |
| **Terminbuchung** | Cal.com API Integration (Demo-Modus ohne Konfiguration) |
| **Gesprächs-Summary** | Automatische Zusammenfassung nach jedem Call |
| **Dashboard** | Echtzeit-KPIs: Conversion Rate, Funnel, Score-Verteilung |
| **Split-Panel UI** | Agent links, Dashboard rechts — alles auf einen Blick |
| **SQLite-Datenbank** | Persistente Speicherung aller Calls und Lead-Daten |

---

## Architektur

```
Browser (Next.js)
├── AgentPanel          ← VAPI Web SDK (WebRTC)
│   ├── Mikrofon → VAPI → Inworld TTS (Lennart)
│   ├── Transkript live
│   └── Lead-Score live
└── DashboardPanel      ← Polling /api/dashboard

Next.js API Routes (Node.js)
├── /api/qualify-lead   ← Lead-Daten speichern + Score berechnen
├── /api/book-demo      ← Cal.com Terminbuchung
├── /api/dashboard      ← KPI-Aggregation aus SQLite
├── /api/seed           ← Demo-Daten für sofortige Vorschau
└── /api/vapi/webhook   ← Für echte Telefonanrufe (Produktiv)

Daten
└── data/voice-agent.db (SQLite)
    ├── calls           ← Gesprächsprotokoll
    └── lead_data       ← Qualifizierungsdaten
```

### Gesprächsfluss

```
Lead spricht → VAPI STT (Deepgram) → GPT-4o-mini (Sarah)
    → Inworld TTS (Lennart) → Lead hört Antwort
    → LEAD_DATA/BOOKING Marker → API Routes → SQLite
    → Dashboard aktualisiert
```

### Lead-Scoring Algorithmus

| Kriterium | Max. Punkte |
|---|---|
| Entscheidungsbefugnis | 3 |
| Budget (≥ 2.000€/Monat) | 3 |
| Unternehmensgröße (≥ 50 MA) | 2 |
| Zeitplan (≤ 1 Monat) | 2 |
| Pain Point definiert | 1 |
| **Gesamt** | **11** |

- **Score A** (Hot Lead): ≥ 8 Punkte
- **Score B** (Warm Lead): 4–7 Punkte
- **Score C** (Cold Lead): < 4 Punkte

---

## Tech Stack

| Komponente | Technologie |
|---|---|
| Framework | Next.js 16, React 19, TypeScript |
| Voice Platform | VAPI (WebRTC, < 1.5s Latenz) |
| LLM | OpenAI GPT-4o-mini |
| STT | Deepgram Nova-2 (Deutsch) |
| TTS | Inworld (Lennart) |
| Kalender | Cal.com API |
| Datenbank | SQLite (better-sqlite3) |
| Styling | Tailwind CSS 4, Glassmorphism |

---

## Setup

### Voraussetzungen
- Node.js 18+
- VAPI Account ([vapi.ai](https://vapi.ai))
- OpenAI API Key (in VAPI Dashboard → Provider Keys hinterlegen)

### Installation

```bash
git clone <repo-url>
cd flowai-voice-agent
npm install
```

### Konfiguration

```bash
cp .env.example .env.local
```

`.env.local` ausfüllen:

```env
# Pflicht
NEXT_PUBLIC_VAPI_PUBLIC_KEY=dein_vapi_public_key

# Optional: Cal.com für echte Terminbuchung
CALCOM_API_KEY=cal_live_...
CALCOM_EVENT_TYPE_ID=123456
```

**VAPI Dashboard konfigurieren:**
1. Provider Keys → OpenAI Key eintragen
2. Provider Keys → Inworld Key eintragen

### Starten

```bash
npm run dev
# → http://localhost:3000
```

### Demo-Daten laden

Im Dashboard auf **„Demo-Daten laden"** klicken — 10 realistische Beispiel-Calls werden generiert.

---

## Gesprächslogik (Prompts)

Die vollständige Gesprächsstrategie von Sarah befindet sich in:

```
prompts/sarah-system-prompt.md
```

Die VAPI-Konfiguration für Produktiv-Deployment (Telefonanrufe):

```
vapi.config.json
```

---

## Dashboard KPIs

| KPI | Beschreibung |
|---|---|
| **Conversion Rate** | Anteil Calls mit gebuchtem Termin |
| **Ø Gesprächsdauer** | Durchschnittliche Call-Länge |
| **Lead-Score Verteilung** | A/B/C Anteile aller Leads |
| **Gesprächs-Funnel** | Drop-off pro Phase (Begrüßung → Buchung) |
| **Letzte Anrufe** | Tabelle mit Score, Termin, Details |

---

## Design-Entscheidungen

**Warum VAPI?**
VAPI abstrahiert WebRTC, STT und TTS in einer API. Latenz unter 1.5 Sekunden ist damit ohne eigene Infrastruktur erreichbar.

**Warum Inline-Config statt VAPI Dashboard?**
Für die Demo-Umgebung ermöglicht die Inline-Konfiguration einen sofortigen Start ohne Dashboard-Setup. In Produktion empfiehlt sich ein vorkonfigurierter Assistant mit Server-seitigen Tools.

**Warum SQLite?**
Kein externer Datenbankserver nötig. Für ein Demo- und Contest-Projekt ideal — alle Daten bleiben lokal und der Start ist sofort möglich.

**Warum Marker-basiertes Tool-Calling?**
VAPI erlaubt in der Inline-Config keine `tools`-Property. Als Alternative gibt Sarah strukturierte Marker (`LEAD_DATA:{}`, `BOOKING:{}`) im Transkript aus, die client-seitig geparst werden.

---

## Projektstruktur

```
flowai-voice-agent/
├── app/
│   ├── api/
│   │   ├── book-demo/        ← Cal.com Buchung
│   │   ├── dashboard/        ← KPI-Daten
│   │   ├── qualify-lead/     ← Lead-Score + SQLite
│   │   ├── seed/             ← Demo-Daten
│   │   └── vapi/webhook/     ← Produktiv-Webhook
│   ├── components/
│   │   ├── AgentPanel.tsx    ← Voice Interface
│   │   └── DashboardPanel.tsx← KPI Dashboard
│   ├── lib/
│   │   ├── calcom.ts         ← Cal.com API Client
│   │   ├── db.ts             ← SQLite Setup
│   │   ├── lead-scorer.ts    ← Scoring Algorithmus
│   │   └── types.ts          ← TypeScript Typen
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx              ← Split-Panel Hauptseite
├── prompts/
│   └── sarah-system-prompt.md
├── data/                     ← SQLite DB (gitignored)
├── vapi.config.json          ← VAPI Produktiv-Config
├── .env.example
└── README.md
```

---

## Autoren

Fatih Altiok & Claude
