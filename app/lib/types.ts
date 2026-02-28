export type LeadScore = "A" | "B" | "C";

export type DropOffStage =
  | "greeting"
  | "discovery"
  | "qualification"
  | "objection"
  | "booking"
  | "booked";

export interface Call {
  id: number;
  vapi_call_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  transcript: string | null;
  summary: string | null;
  lead_score: LeadScore;
  appointment_booked: number;
  appointment_time: string | null;
  appointment_url: string | null;
  drop_off_stage: DropOffStage;
  lead_name: string | null;
  lead_email: string | null;
}

export interface LeadData {
  id: number;
  call_id: number;
  company_size: string | null;
  budget: string | null;
  is_decision_maker: number;
  timeline: string | null;
  pain_point: string | null;
  current_tools: string | null;
}

export interface CallWithLeadData extends Call {
  company_size?: string | null;
  budget?: string | null;
  is_decision_maker?: number | null;
  timeline?: string | null;
  pain_point?: string | null;
}

export interface DashboardData {
  total_calls: number;
  booked_calls: number;
  conversion_rate: number;
  avg_duration_seconds: number;
  score_a: number;
  score_b: number;
  score_c: number;
  drop_off_stats: { stage: string; count: number }[];
  recent_calls: CallWithLeadData[];
}

export interface QualifyLeadParams {
  company_size?: string;
  budget?: string;
  is_decision_maker?: boolean;
  timeline?: string;
  pain_point?: string;
  current_tools?: string;
  lead_name?: string;
  lead_email?: string;
  vapi_call_id?: string;
}

export interface BookDemoParams {
  lead_name: string;
  lead_email: string;
  preferred_time?: string;
  vapi_call_id?: string;
}
