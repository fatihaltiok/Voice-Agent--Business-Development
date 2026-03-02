export interface BookingResult {
  success: boolean;
  booking_url?: string;
  booking_id?: string;
  start_time?: string;
  message?: string;
  error?: string;
}

interface CalComBookingResponse {
  uid?: string;
  startTime?: string;
  message?: string;
}

async function parseResponse(response: Response): Promise<CalComBookingResponse> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as CalComBookingResponse;
  } catch {
    return { message: text };
  }
}

export async function bookDemoAppointment(params: {
  name: string;
  email: string;
  preferred_time?: string;
}): Promise<BookingResult> {
  const apiKey = process.env.CALCOM_API_KEY;
  const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;

  // Demo-Modus: Cal.com nicht konfiguriert
  if (!apiKey || !eventTypeId) {
    const demoDate = params.preferred_time
      ? new Date(params.preferred_time)
      : new Date(Date.now() + 86400000); // morgen

    return {
      success: true,
      booking_url: "https://cal.com/demo/confirmed",
      booking_id: `DEMO-${Date.now()}`,
      start_time: demoDate.toISOString(),
      message: `Demo-Termin am ${demoDate.toLocaleString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })} Uhr bestätigt.`,
    };
  }

  try {
    const startDate = new Date(params.preferred_time || Date.now() + 86400000);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);

    const payload = {
      eventTypeId: parseInt(eventTypeId, 10),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      responses: {
        name: params.name,
        email: params.email,
        location: { value: "integrations:daily", optionValue: "" },
      },
      timeZone: "Europe/Berlin",
      language: "de",
      metadata: {},
    };

    // Bevorzugt Key per Authorization-Header (nicht im Query-String logbar).
    let response = await fetch("https://api.cal.com/v1/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    // Fallback für ältere Cal.com-Konfigurationen.
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      response = await fetch(
        `https://api.cal.com/v1/bookings?apiKey=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
    }

    const data = await parseResponse(response);

    if (!response.ok) {
      return { success: false, error: data.message || "Buchung fehlgeschlagen" };
    }

    return {
      success: true,
      booking_url: data.uid ? `https://cal.com/booking/${data.uid}` : undefined,
      booking_id: data.uid,
      start_time: data.startTime,
      message: data.startTime
        ? `Termin am ${new Date(data.startTime).toLocaleString("de-DE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })} Uhr gebucht.`
        : "Termin gebucht.",
    };
  } catch {
    return { success: false, error: "Verbindung zu Cal.com fehlgeschlagen" };
  }
}
