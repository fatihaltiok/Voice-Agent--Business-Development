import { NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";

// Demo-Daten für das Dashboard — nur einmalig aufrufen
export async function POST() {
  const db = getDb();

  const existing = (
    db.prepare("SELECT COUNT(*) as count FROM calls").get() as { count: number }
  ).count;

  if (existing > 0) {
    return NextResponse.json({ message: "Bereits initialisiert", count: existing });
  }

  const demoData = [
    {
      name: "Max Müller", email: "max.mueller@techfirm.de",
      score: "A", booked: 1, stage: "booked", duration: 312,
      size: "45 Mitarbeiter", budget: "2.500€", dm: 1, timeline: "1 Monat",
      pain: "Zu langsame Lead-Reaktion, manuelle Prozesse",
    },
    {
      name: "Anna Kovacs", email: "a.kovacs@sales-pro.de",
      score: "B", booked: 0, stage: "objection", duration: 165,
      size: "22 Mitarbeiter", budget: "800€", dm: 0, timeline: "3 Monate",
      pain: "CRM zu komplex, Team nutzt es nicht",
    },
    {
      name: "Peter Lenz", email: "p.lenz@digitalvision.com",
      score: "A", booked: 1, stage: "booked", duration: 361,
      size: "78 Mitarbeiter", budget: "4.000€", dm: 1, timeline: "sofort",
      pain: "Vertriebsteam verliert Leads, kein Follow-up System",
    },
    {
      name: "Sandra Bauer", email: "s.bauer@consulting24.de",
      score: "C", booked: 0, stage: "discovery", duration: 89,
      size: "5 Mitarbeiter", budget: "150€", dm: 1, timeline: "1 Jahr",
      pain: "Zu wenig Leads generell",
    },
    {
      name: "Thomas Richter", email: "t.richter@industriewerk.de",
      score: "B", booked: 1, stage: "booked", duration: 274,
      size: "35 Mitarbeiter", budget: "1.200€", dm: 1, timeline: "2 Monate",
      pain: "Altes CRM, keine KI-Integration",
    },
    {
      name: "Julia Werner", email: "j.werner@mediakraft.de",
      score: "A", booked: 1, stage: "booked", duration: 298,
      size: "60 Mitarbeiter", budget: "3.000€", dm: 1, timeline: "sofort",
      pain: "Sales-Team arbeitet mit Excel, keine Automatisierung",
    },
    {
      name: "Klaus Hoffmann", email: "k.hoffmann@financeplus.de",
      score: "C", booked: 0, stage: "greeting", duration: 45,
      size: "8 Mitarbeiter", budget: null, dm: 0, timeline: null,
      pain: null,
    },
    {
      name: "Maria Schmidt", email: "m.schmidt@healthtech.de",
      score: "B", booked: 0, stage: "qualification", duration: 201,
      size: "28 Mitarbeiter", budget: "600€", dm: 0, timeline: "4 Monate",
      pain: "Keine Sichtbarkeit über Pipeline",
    },
    {
      name: "Frank Braun", email: "f.braun@autohaus-braun.de",
      score: "A", booked: 1, stage: "booked", duration: 389,
      size: "52 Mitarbeiter", budget: "2.800€", dm: 1, timeline: "6 Wochen",
      pain: "Nachfassprozesse kosten zu viel Zeit",
    },
    {
      name: "Lisa Kohl", email: "l.kohl@startup-lab.de",
      score: "B", booked: 0, stage: "booking", duration: 243,
      size: "15 Mitarbeiter", budget: "900€", dm: 1, timeline: "2 Monate",
      pain: "Wachstum ohne skalierbare Vertriebsprozesse",
    },
  ];

  const insertCall = db.prepare(
    `INSERT INTO calls (vapi_call_id, started_at, ended_at, duration_seconds, lead_score,
      appointment_booked, drop_off_stage, lead_name, lead_email,
      summary, appointment_time)
     VALUES (?, datetime('now', ? || ' hours'), datetime('now', ? || ' hours', ? || ' minutes'),
      ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertLead = db.prepare(
    `INSERT INTO lead_data (call_id, company_size, budget, is_decision_maker, timeline, pain_point)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertAll = db.transaction(() => {
    demoData.forEach((d, i) => {
      const hoursAgo = -(i * 8 + Math.floor(Math.random() * 4));
      const result = insertCall.run(
        `demo-${i + 1}`,
        String(hoursAgo),
        String(hoursAgo),
        String(Math.floor(d.duration / 60)),
        d.duration,
        d.score,
        d.booked,
        d.stage,
        d.name,
        d.email,
        d.booked
          ? `${d.name} von ${d.size}. Score: ${d.score}. Demo-Termin gebucht.`
          : `${d.name}. Score: ${d.score}. Kein Termin gebucht (${d.stage}).`,
        d.booked
          ? new Date(Date.now() + (i + 3) * 86400000).toISOString()
          : null
      );

      if (d.size || d.budget || d.pain) {
        insertLead.run(
          result.lastInsertRowid,
          d.size,
          d.budget,
          d.dm,
          d.timeline,
          d.pain
        );
      }
    });
  });

  insertAll();

  return NextResponse.json({ message: "Demo-Daten erstellt", count: demoData.length });
}
