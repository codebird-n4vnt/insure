/**
 * Historical backtest of a drought rule, straight from the Open-Meteo ERA5 archive
 * (free, keyless, CORS-enabled). Replays the vault's exact rule — "any N-day window
 * inside coverage with rainfall below T mm" — over the same calendar window in
 * each of the last `years` years.
 */

const DAY_MS = 86_400_000;

export interface Season {
  /** Calendar year the season started in */
  year: number;
  start: string;
  end: string;
  /** Driest N-day rainfall inside the season */
  minRainMm: number;
  /** Last day of that driest window */
  driestWindowEnd: string;
  triggered: boolean;
}

export interface BacktestResult {
  seasons: Season[];
  triggeredCount: number;
  /** Laplace-smoothed (k+1)/(n+2), so a clean history never prices risk at zero */
  probability: number;
  source: string;
}

export interface BacktestInput {
  lat: number;
  lon: number;
  /** unix seconds */
  coverageStart: number;
  coverageEnd: number;
  observationDays: number;
  thresholdMm: number;
  years?: number;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayFloor = (ms: number) => ms - (((ms % DAY_MS) + DAY_MS) % DAY_MS);

function shiftYears(ms: number, years: number): number {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
}

const cache = new Map<string, Promise<BacktestResult>>();

export function backtestWeather(input: BacktestInput, fetchImpl: typeof fetch = fetch): Promise<BacktestResult> {
  const key = JSON.stringify({ ...input, lat: input.lat.toFixed(3), lon: input.lon.toFixed(3) });
  let p = cache.get(key);
  if (!p) {
    p = run(input, fetchImpl);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function run(
  { lat, lon, coverageStart, coverageEnd, observationDays, thresholdMm, years = 10 }: BacktestInput,
  fetchImpl: typeof fetch
): Promise<BacktestResult> {
  const startMs = dayFloor(coverageStart * 1000);
  // Seasons longer than a year can't be replayed year-by-year; cap at 366 days.
  const endMs = Math.min(dayFloor(coverageEnd * 1000), startMs + 366 * DAY_MS);
  const latestUsable = dayFloor(Date.now()) - 7 * DAY_MS; // ERA5 lags ~5 days

  const windows: { year: number; from: number; to: number }[] = [];
  for (let k = 1; windows.length < years && k <= years + 2; k++) {
    const from = shiftYears(startMs, k);
    const to = shiftYears(endMs, k) - DAY_MS;
    if (to <= latestUsable) windows.push({ year: new Date(from).getUTCFullYear(), from, to });
  }
  if (windows.length === 0) throw new Error('Not enough history for this window yet.');

  const first = Math.min(...windows.map((w) => w.from));
  const last = Math.max(...windows.map((w) => w.to));
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&start_date=${iso(first)}&end_date=${iso(last)}&daily=precipitation_sum&timezone=UTC`;

  let body: { daily?: { time: string[]; precipitation_sum: (number | null)[] }; reason?: string } | null = null;
  for (let attempt = 0; attempt < 2 && !body?.daily; attempt++) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(25_000) });
    body = await res.json().catch(() => null);
    if (!res.ok && attempt === 1) throw new Error(body?.reason ?? `Open-Meteo returned ${res.status}`);
  }
  if (!body?.daily) throw new Error('Rainfall history unavailable right now.');

  const rain = new Map<string, number | null>();
  body.daily.time.forEach((d, i) => rain.set(d, body!.daily!.precipitation_sum[i]));

  const seasons: Season[] = [];
  for (const w of windows) {
    const days: { date: string; mm: number }[] = [];
    let complete = true;
    for (let t = w.from; t <= w.to; t += DAY_MS) {
      const mm = rain.get(iso(t));
      if (mm === null || mm === undefined) {
        complete = false;
        break;
      }
      days.push({ date: iso(t), mm });
    }
    if (!complete || days.length === 0) continue;

    const n = Math.min(observationDays, days.length);
    let sum = days.slice(0, n).reduce((s, d) => s + d.mm, 0);
    let min = sum;
    let minEnd = n - 1;
    for (let i = n; i < days.length; i++) {
      sum += days[i].mm - days[i - n].mm;
      if (sum < min - 1e-9) {
        min = sum;
        minEnd = i;
      }
    }
    // The rolling subtraction can leave -1e-15 behind; rainfall is never negative (and never "-0").
    const minRainMm = Math.max(0, Math.round(min * 10) / 10) + 0;
    seasons.push({
      year: w.year,
      start: days[0].date,
      end: days[days.length - 1].date,
      minRainMm,
      driestWindowEnd: days[minEnd].date,
      triggered: minRainMm < thresholdMm,
    });
  }
  if (seasons.length === 0) throw new Error('Rainfall history is incomplete for this location.');
  seasons.sort((a, b) => a.year - b.year);

  const triggeredCount = seasons.filter((s) => s.triggered).length;
  return {
    seasons,
    triggeredCount,
    probability: (triggeredCount + 1) / (seasons.length + 2),
    source: 'Open-Meteo ERA5 reanalysis',
  };
}

/** Number of monthly premiums a policyholder pays over the coverage window. */
export const premiumPeriods = (coverageStart: number, coverageEnd: number, monthly: boolean) =>
  monthly ? Math.max(1, Math.ceil((coverageEnd - coverageStart) / (30 * 86_400))) : 1;

/**
 * Break-even premium plus a margin: expected payout / number of premiums.
 * Expected payout = P(trigger) × payout. Ignores the creator fee's share, which
 * comes out of the premium — so the margin must cover it.
 */
export function suggestPremium(probability: number, payoutUsd: number, periods: number, margin = 0.25): number {
  return Math.ceil(((probability * payoutUsd * (1 + margin)) / periods) * 100) / 100;
}

/** Expected claims paid per dollar of premium collected (under 1 = profitable on average). */
export const expectedLossRatio = (probability: number, payoutUsd: number, premiumUsd: number, periods: number) =>
  (probability * payoutUsd) / (premiumUsd * periods);

export interface Place {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

/** Open-Meteo geocoding: free, keyless, CORS-enabled. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,
    { signal: AbortSignal.timeout(10_000) }
  );
  const body: { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] } = await res.json();
  return (body.results ?? []).map((r) => ({
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
