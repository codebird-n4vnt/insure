import { config } from "../config";
import { extractFlightWithGemini, geminiAvailable } from "./gemini";
import type { FetchFn, Outcome } from "./types";

export type FlightStatus = "scheduled" | "active" | "landed" | "cancelled" | "diverted" | "unknown";

export interface FlightRecord {
  source: string;
  flightIata: string;
  flightDate: string;
  status: FlightStatus;
  departureDelayMinutes: number | null;
  arrivalDelayMinutes: number | null;
  /** "parser" = deterministic code path, "gemini" = LLM extraction fallback */
  extractedBy: "parser" | "gemini";
  codeshared?: boolean;
}

function minutesBetween(scheduled?: string | null, actual?: string | null): number | null {
  if (!scheduled || !actual) return null;
  const a = Date.parse(actual);
  const s = Date.parse(scheduled);
  if (!Number.isFinite(a) || !Number.isFinite(s)) return null;
  return Math.round((a - s) / 60_000);
}

const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s/g, "");

// ─── Aviationstack ─────────────────────────────────────────────────────────

const AVSTACK_STATUS: Record<string, FlightStatus> = {
  scheduled: "scheduled",
  active: "active",
  landed: "landed",
  cancelled: "cancelled",
  diverted: "diverted",
  incident: "unknown",
};

export function parseAviationstack(body: any, flightNumber: string, flightDate: string): FlightRecord[] {
  const rows: any[] = Array.isArray(body?.data) ? body.data : [];
  return rows
    .filter((r) => norm(r?.flight?.iata) === norm(flightNumber) && r?.flight_date === flightDate)
    .map((r) => {
      // Aviationstack labels local times as +00:00; scheduled and actual share the
      // same offset, so their difference is still correct.
      const arr = r.arrival ?? {};
      const dep = r.departure ?? {};
      const arrivalDelay =
        minutesBetween(arr.scheduled, arr.actual ?? arr.actual_runway) ??
        (r.flight_status === "landed" && Number.isFinite(arr.delay) ? arr.delay : null);
      const departureDelay =
        minutesBetween(dep.scheduled, dep.actual ?? dep.actual_runway) ??
        (Number.isFinite(dep.delay) && (dep.actual || dep.actual_runway) ? dep.delay : null);
      return {
        source: "aviationstack",
        flightIata: norm(r.flight.iata),
        flightDate: r.flight_date,
        status: AVSTACK_STATUS[r.flight_status] ?? "unknown",
        departureDelayMinutes: departureDelay,
        arrivalDelayMinutes: arrivalDelay,
        extractedBy: "parser" as const,
        codeshared: !!r.flight?.codeshared,
      };
    });
}

async function fetchAviationstack(flightNumber: string, flightDate: string, fetchImpl: FetchFn) {
  const url =
    `${config.aviationstackBaseUrl}/flights?access_key=${encodeURIComponent(config.aviationstackApiKey)}` +
    `&flight_iata=${encodeURIComponent(flightNumber)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  const body: any = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error(`aviationstack: ${res.status} ${body?.error?.code ?? ""} ${body?.error?.message ?? ""}`.trim());
  }
  // Keep only rows for this flight so the evidence (and any Gemini prompt) stays small.
  const data = (body.data ?? []).filter((r: any) => norm(r?.flight?.iata) === norm(flightNumber));
  return {
    publicUrl: url.replace(/access_key=[^&]+/, "access_key=***"),
    body: { data },
    records: parseAviationstack({ data }, flightNumber, flightDate),
  };
}

// ─── AeroDataBox (RapidAPI) ────────────────────────────────────────────────

const ADB_STATUS: Record<string, FlightStatus> = {
  expected: "scheduled",
  checkin: "scheduled",
  boarding: "scheduled",
  gateclosed: "scheduled",
  delayed: "scheduled",
  departed: "active",
  enroute: "active",
  approaching: "active",
  arrived: "landed",
  canceled: "cancelled",
  cancelled: "cancelled",
  canceleduncertain: "unknown",
  diverted: "diverted",
};

function adbTime(t: any): string | null {
  if (!t) return null;
  if (typeof t === "string") return t;
  return t.utc ?? t.local ?? null;
}

export function parseAerodatabox(body: any, flightNumber: string, flightDate: string): FlightRecord[] {
  const rows: any[] = Array.isArray(body) ? body : [];
  return rows
    .filter((r) => norm(r?.number) === norm(flightNumber))
    .map((r) => {
      const dep = r.departure ?? {};
      const arr = r.arrival ?? {};
      const depSched = adbTime(dep.scheduledTime) ?? dep.scheduledTimeUtc;
      const arrSched = adbTime(arr.scheduledTime) ?? arr.scheduledTimeUtc;
      const depActual = adbTime(dep.runwayTime) ?? adbTime(dep.revisedTime) ?? dep.actualTimeUtc;
      const arrActual = adbTime(arr.runwayTime) ?? adbTime(arr.revisedTime) ?? arr.actualTimeUtc;
      const status = ADB_STATUS[String(r.status ?? "").toLowerCase().replace(/\s/g, "")] ?? "unknown";
      return {
        source: "aerodatabox",
        flightIata: norm(r.number),
        flightDate: String(adbTime(dep.scheduledTime) ?? flightDate).slice(0, 10),
        status,
        // Revised times are estimates until the leg is flown.
        departureDelayMinutes: status === "scheduled" ? null : minutesBetween(depSched, depActual),
        arrivalDelayMinutes: status === "landed" ? minutesBetween(arrSched, arrActual) : null,
        extractedBy: "parser" as const,
        codeshared: String(r.codeshareStatus ?? "").toLowerCase() === "iscodeshared",
      };
    })
    .filter((r) => r.flightDate === flightDate);
}

async function fetchAerodatabox(flightNumber: string, flightDate: string, fetchImpl: FetchFn) {
  const url =
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${flightDate}` +
    `?withAircraftImage=false&withLocation=false`;
  const res = await fetchImpl(url, {
    headers: {
      "X-RapidAPI-Key": config.aerodataboxApiKey,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 204) return { publicUrl: url, body: [], records: [] };
  const body: any = await res.json().catch(() => null);
  if (!res.ok || body === null) throw new Error(`aerodatabox: ${res.status} ${body?.message ?? ""}`.trim());
  return { publicUrl: url, body, records: parseAerodatabox(body, flightNumber, flightDate) };
}

// ─── decision ──────────────────────────────────────────────────────────────

/** Prefer the operating carrier's record over codeshares. */
export function pickRecord(records: FlightRecord[]): FlightRecord | null {
  if (records.length === 0) return null;
  return records.find((r) => !r.codeshared) ?? records[0];
}

/**
 * Pure rule: pay if the flight was cancelled or diverted, or if the departure or
 * arrival delay reached the threshold. An early arrival doesn't cancel out a late departure.
 */
export function decideFlight(record: FlightRecord, thresholdMinutes: number): Outcome {
  const data = { record, thresholdMinutes };
  if (record.status === "cancelled") {
    return { decision: "approve", observedValue: -1, summary: `Flight ${record.flightIata} was cancelled.`, data };
  }
  if (record.status === "diverted") {
    return { decision: "approve", observedValue: -2, summary: `Flight ${record.flightIata} was diverted.`, data };
  }
  const delays = [record.departureDelayMinutes, record.arrivalDelayMinutes].filter(
    (d): d is number => d !== null
  );
  const worst = delays.length ? Math.max(...delays) : null;

  if (worst !== null && worst >= thresholdMinutes) {
    return {
      decision: "approve",
      observedValue: worst,
      summary: `Flight ${record.flightIata} was delayed ${worst} min (threshold ${thresholdMinutes} min).`,
      data,
    };
  }
  if (record.status !== "landed" || record.arrivalDelayMinutes === null) {
    return {
      decision: "defer",
      reason: `Flight ${record.flightIata} is "${record.status}" and hasn't reached the threshold yet; waiting for arrival data.`,
      data,
    };
  }
  return {
    decision: "reject",
    observedValue: worst ?? 0,
    summary: `Flight ${record.flightIata} was delayed ${worst ?? 0} min, below the ${thresholdMinutes} min threshold.`,
    data,
  };
}

/** Sanity-check an LLM extraction before letting it anywhere near a payout rule. */
export function acceptGeminiRecord(
  x: { found: boolean; flightIata: string; flightDate: string },
  flightNumber: string,
  flightDate: string
): boolean {
  return x.found && norm(x.flightIata) === norm(flightNumber) && x.flightDate === flightDate;
}

export async function evaluateFlight(
  flightNumber: string,
  flightDate: string,
  thresholdMinutes: number,
  fetchImpl: FetchFn = fetch
): Promise<Outcome> {
  const providers: { name: string; run: () => ReturnType<typeof fetchAviationstack> }[] = [];
  if (config.aerodataboxApiKey) providers.push({ name: "aerodatabox", run: () => fetchAerodatabox(flightNumber, flightDate, fetchImpl) });
  if (config.aviationstackApiKey) providers.push({ name: "aviationstack", run: () => fetchAviationstack(flightNumber, flightDate, fetchImpl) });
  if (providers.length === 0) {
    return { decision: "defer", reason: "No flight data provider configured (set AVIATIONSTACK_API_KEY or AERODATABOX_API_KEY)." };
  }

  const errors: string[] = [];
  const deferrals: string[] = [];
  for (const p of providers) {
    let fetched;
    try {
      fetched = await p.run();
    } catch (e: any) {
      errors.push(e?.message ?? String(e));
      continue;
    }

    let record = pickRecord(fetched.records);

    // Parser found nothing usable but the provider did return data → let Gemini try.
    const hasRows = Array.isArray(fetched.body) ? fetched.body.length > 0 : (fetched.body as any)?.data?.length > 0;
    if (!record && hasRows && geminiAvailable()) {
      const g = await extractFlightWithGemini(fetched.body, flightNumber, flightDate);
      if (g && acceptGeminiRecord(g.value, flightNumber, flightDate)) {
        record = {
          source: `${p.name}+${g.model}`,
          flightIata: g.value.flightIata,
          flightDate: g.value.flightDate,
          status: g.value.status,
          departureDelayMinutes: g.value.departureDelayMinutes,
          arrivalDelayMinutes: g.value.arrivalDelayMinutes,
          extractedBy: "gemini",
        };
      }
    }

    if (!record) {
      deferrals.push(`${p.name}: no record for ${flightNumber} on ${flightDate}`);
      continue;
    }
    const outcome = decideFlight(record, thresholdMinutes);
    if (outcome.decision === "defer") {
      deferrals.push(outcome.reason);
      continue;
    }
    outcome.data = { ...outcome.data, providerUrl: fetched.publicUrl, providerResponse: fetched.body };
    return outcome;
  }

  return {
    decision: "defer",
    reason: [...deferrals, ...errors].join(" | ") || "Flight data unavailable",
  };
}
