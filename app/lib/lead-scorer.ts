import type { LeadScore } from "./types";

interface ScoringInput {
  company_size?: string;
  budget?: string;
  is_decision_maker?: boolean | number;
  timeline?: string;
  pain_point?: string;
}

function parseBudget(budget: string): number {
  const cleaned = budget.replace(/[^0-9]/g, "");
  return parseInt(cleaned) || 0;
}

function parseTimeline(timeline: string): number {
  const lower = timeline.toLowerCase();
  if (lower.includes("sofort") || lower.includes("asap") || lower.includes("jetzt")) return 0;
  if (lower.includes("monat")) {
    const match = lower.match(/(\d+)/);
    return match ? parseInt(match[1]) : 6;
  }
  if (lower.includes("quartal") || lower.includes("quarter")) return 3;
  if (lower.includes("halb") || lower.includes("6")) return 6;
  if (lower.includes("jahr") || lower.includes("year")) return 12;
  return 6;
}

function parseCompanySize(size: string): number {
  const cleaned = size.replace(/[^0-9]/g, "");
  return parseInt(cleaned) || 0;
}

export function calculateLeadScore(data: ScoringInput): LeadScore {
  let points = 0;

  // Entscheidungsbefugnis: 3 Punkte (kritischstes Kriterium)
  if (data.is_decision_maker === true || data.is_decision_maker === 1) {
    points += 3;
  }

  // Budget: max 3 Punkte
  if (data.budget) {
    const budget = parseBudget(data.budget);
    if (budget >= 2000) points += 3;
    else if (budget >= 500) points += 2;
    else if (budget >= 200) points += 1;
  }

  // Unternehmensgröße: max 2 Punkte
  if (data.company_size) {
    const size = parseCompanySize(data.company_size);
    if (size >= 50) points += 2;
    else if (size >= 10) points += 1;
  }

  // Zeitplan: max 2 Punkte
  if (data.timeline) {
    const months = parseTimeline(data.timeline);
    if (months <= 1) points += 2;
    else if (months <= 3) points += 1;
  }

  // Pain point definiert: 1 Punkt
  if (data.pain_point && data.pain_point.length > 5) points += 1;

  // Score-Verteilung: max 11 Punkte
  if (points >= 8) return "A";
  if (points >= 4) return "B";
  return "C";
}
