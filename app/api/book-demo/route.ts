import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/app/lib/db";
import { bookDemoAppointment } from "@/app/lib/calcom";
import type { BookDemoParams } from "@/app/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body: BookDemoParams = await req.json();
  const db = getDb();

  const result = await bookDemoAppointment({
    name: body.lead_name,
    email: body.lead_email,
    preferred_time: body.preferred_time,
  });

  if (result.success && body.vapi_call_id) {
    db.prepare(
      `UPDATE calls
       SET appointment_booked = 1,
           appointment_time = ?,
           appointment_url = ?,
           drop_off_stage = 'booked',
           lead_name = COALESCE(lead_name, ?),
           lead_email = COALESCE(lead_email, ?)
       WHERE vapi_call_id = ?`
    ).run(
      result.start_time || null,
      result.booking_url || null,
      body.lead_name,
      body.lead_email,
      body.vapi_call_id
    );
  }

  return NextResponse.json(result);
}
