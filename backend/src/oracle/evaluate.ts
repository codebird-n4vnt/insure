import { evaluateFlight } from "./flight";
import { decideWeather, fetchDailyRainfall, weatherWindow } from "./weather";
import type { ClaimContext, FetchFn, Outcome } from "./types";

/** Turn a claim into approve / reject / defer using real-world data and a fixed rule. */
export async function evaluateClaim(ctx: ClaimContext, fetchImpl: FetchFn = fetch): Promise<Outcome> {
  if (ctx.risk.kind === "weather") {
    // Claims may be filed shortly after coverage ends; never count uncovered days.
    const { start, end } = weatherWindow(Math.min(ctx.filedAt, ctx.personalCoverageEnd), ctx.observationDays);
    let series;
    try {
      series = await fetchDailyRainfall(ctx.risk.latitude, ctx.risk.longitude, start, end, fetchImpl);
    } catch (e: any) {
      return { decision: "defer", reason: e?.message ?? String(e) };
    }
    return decideWeather(series, ctx.observationDays, ctx.threshold);
  }
  return evaluateFlight(ctx.risk.flightNumber, ctx.risk.flightDate, ctx.threshold, fetchImpl);
}
