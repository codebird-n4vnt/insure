import type { FetchFn, Outcome } from "./types";

const DAY = 86_400;

export function isoDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

/**
 * The rainfall window is the `observationDays` full UTC days before `endTs`
 * (= min(filed_at, paid coverage end)). The program guarantees it lies inside coverage.
 */
export function weatherWindow(endTs: number, observationDays: number): { start: string; end: string } {
  const endDay = endTs - (endTs % DAY);
  const end = endDay - DAY;
  const start = end - (observationDays - 1) * DAY;
  return { start: isoDate(start), end: isoDate(end) };
}

export interface RainfallSeries {
  source: string;
  url: string;
  days: { date: string; mm: number | null }[];
}

/**
 * Open-Meteo: free, keyless, global. The forecast endpoint serves the recent past
 * (~3 months) from its analysis models; older windows come from the ERA5 archive.
 */
export async function fetchDailyRainfall(
  lat: number,
  lon: number,
  start: string,
  end: string,
  fetchImpl: FetchFn = fetch,
  now = new Date()
): Promise<RainfallSeries> {
  const ageDays = (now.getTime() - Date.parse(end)) / 86_400_000;
  const params =
    `?latitude=${lat.toFixed(6)}&longitude=${lon.toFixed(6)}` +
    `&start_date=${start}&end_date=${end}&daily=precipitation_sum&timezone=UTC`;
  const endpoints =
    ageDays <= 60
      ? ["https://api.open-meteo.com/v1/forecast", "https://archive-api.open-meteo.com/v1/archive"]
      : ["https://archive-api.open-meteo.com/v1/archive", "https://api.open-meteo.com/v1/forecast"];

  // The forecast endpoint answers 200 but leaves older days null; the archive lags
  // ~5 days. So query in order and fill any missing day from the next source.
  let lastError = "";
  let merged: RainfallSeries | null = null;
  const sources: string[] = [];
  for (const base of endpoints) {
    const url = base + params;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body || body.error) {
        lastError = `${base}: ${res.status} ${body?.reason ?? ""}`.trim();
        continue;
      }
      const dates: string[] = body.daily?.time ?? [];
      const values: (number | null)[] = body.daily?.precipitation_sum ?? [];
      const byDate = new Map(dates.map((d, i) => [d, values[i] ?? null]));
      sources.push(base.includes("archive") ? "open-meteo-archive (ERA5)" : "open-meteo-forecast (analysis)");
      if (!merged) {
        merged = { source: "", url, days: dates.map((date) => ({ date, mm: byDate.get(date) ?? null })) };
      } else {
        merged.url += ` + ${url}`;
        for (const day of merged.days) if (day.mm === null) day.mm = byDate.get(day.date) ?? null;
      }
      if (merged.days.length > 0 && merged.days.every((d) => d.mm !== null)) break;
    } catch (e: any) {
      lastError = `${base}: ${e?.message ?? e}`;
    }
  }
  if (!merged) throw new Error(`Rainfall data unavailable (${lastError})`);
  merged.source = sources.join(" + ");
  return merged;
}

/** Pure rule: payout if total rainfall over the window is strictly below the threshold. */
export function decideWeather(
  series: RainfallSeries,
  expectedDays: number,
  thresholdMm: number
): Outcome {
  const missing = series.days.filter((d) => d.mm === null).map((d) => d.date);
  if (series.days.length < expectedDays || missing.length > 0) {
    return {
      decision: "defer",
      reason: `Incomplete rainfall data (${series.days.length}/${expectedDays} days, missing: ${missing.join(", ") || "none"})`,
    };
  }
  const days = `${expectedDays} day${expectedDays === 1 ? "" : "s"}`;
  const totalMm = Math.round(series.days.reduce((s, d) => s + (d.mm as number), 0) * 10) / 10;
  const approved = totalMm < thresholdMm;
  return {
    decision: approved ? "approve" : "reject",
    observedValue: Math.round(totalMm * 10),
    summary: approved
      ? `Drought trigger met: ${totalMm} mm of rain over ${days} is below the ${thresholdMm} mm threshold.`
      : `No drought: ${totalMm} mm of rain over ${days} meets the ${thresholdMm} mm threshold.`,
    data: {
      source: series.source,
      url: series.url,
      window: { start: series.days[0]?.date, end: series.days[series.days.length - 1]?.date },
      totalMm,
      thresholdMm,
      daily: series.days,
    },
  };
}
