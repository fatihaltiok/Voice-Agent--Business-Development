import { NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();

  const totalCalls = (
    db.prepare("SELECT COUNT(*) as count FROM calls").get() as { count: number }
  ).count;

  const bookedCalls = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM calls WHERE appointment_booked = 1"
      )
      .get() as { count: number }
  ).count;

  const conversionRate =
    totalCalls > 0 ? Math.round((bookedCalls / totalCalls) * 100) : 0;

  const avgDuration =
    (
      db
        .prepare(
          "SELECT AVG(duration_seconds) as avg FROM calls WHERE duration_seconds > 0"
        )
        .get() as { avg: number | null }
    ).avg || 0;

  const scoreA = (
    db
      .prepare("SELECT COUNT(*) as count FROM calls WHERE lead_score = 'A'")
      .get() as { count: number }
  ).count;

  const scoreB = (
    db
      .prepare("SELECT COUNT(*) as count FROM calls WHERE lead_score = 'B'")
      .get() as { count: number }
  ).count;

  const scoreC = (
    db
      .prepare("SELECT COUNT(*) as count FROM calls WHERE lead_score = 'C'")
      .get() as { count: number }
  ).count;

  const dropOffStats = db
    .prepare(
      `SELECT drop_off_stage as stage, COUNT(*) as count
       FROM calls
       GROUP BY drop_off_stage
       ORDER BY count DESC`
    )
    .all() as { stage: string; count: number }[];

  const recentCalls = db
    .prepare(
      `SELECT c.*, ld.company_size, ld.budget, ld.is_decision_maker, ld.timeline, ld.pain_point
       FROM calls c
       LEFT JOIN lead_data ld ON ld.call_id = c.id
       ORDER BY c.started_at DESC
       LIMIT 10`
    )
    .all();

  return NextResponse.json({
    total_calls: totalCalls,
    booked_calls: bookedCalls,
    conversion_rate: conversionRate,
    avg_duration_seconds: Math.round(avgDuration),
    score_a: scoreA,
    score_b: scoreB,
    score_c: scoreC,
    drop_off_stats: dropOffStats,
    recent_calls: recentCalls,
  });
}
