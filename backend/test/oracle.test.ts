import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJson } from "../src/oracle/gemini";
import { canonicalJson, hashEvidence } from "../src/oracle/evidence";
import {
  acceptGeminiRecord,
  decideFlight,
  parseAerodatabox,
  parseAviationstack,
  pickRecord,
  type FlightRecord,
} from "../src/oracle/flight";
import { decideWeather, fetchDailyRainfall, weatherWindow } from "../src/oracle/weather";

const series = (mm: (number | null)[]) => ({
  source: "test",
  url: "test://",
  days: mm.map((v, i) => ({ date: `2026-05-${String(i + 1).padStart(2, "0")}`, mm: v })),
});

test("weather window is the N full UTC days before filing", () => {
  const filed = Date.parse("2026-06-01T15:30:00Z") / 1000;
  assert.deepEqual(weatherWindow(filed, 30), { start: "2026-05-02", end: "2026-05-31" });
  assert.deepEqual(weatherWindow(filed, 1), { start: "2026-05-31", end: "2026-05-31" });
});

test("weather: below threshold approves, at threshold rejects", () => {
  const dry = decideWeather(series([1, 2, 3.33]), 3, 50);
  assert.equal(dry.decision, "approve");
  assert.equal((dry as { observedValue: number }).observedValue, 63); // 6.3 mm in tenths

  const exact = decideWeather(series([25, 25]), 2, 50);
  assert.equal(exact.decision, "reject");
});

test("weather: missing days defer instead of guessing", () => {
  assert.equal(decideWeather(series([1, null, 3]), 3, 50).decision, "defer");
  assert.equal(decideWeather(series([1, 2]), 3, 50).decision, "defer");
});

test("weather: falls back to the second Open-Meteo endpoint", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string) => {
    calls.push(url);
    if (calls.length === 1) return new Response(JSON.stringify({ error: true, reason: "out of range" }), { status: 400 });
    return new Response(JSON.stringify({ daily: { time: ["2026-01-01"], precipitation_sum: [4.2] } }));
  }) as typeof fetch;
  const s = await fetchDailyRainfall(10, 20, "2026-01-01", "2026-01-01", fakeFetch, new Date("2026-09-01"));
  assert.equal(calls.length, 2);
  assert.match(calls[0], /archive-api/); // old window → archive first
  assert.deepEqual(s.days, [{ date: "2026-01-01", mm: 4.2 }]);
});

const rec = (over: Partial<FlightRecord>): FlightRecord => ({
  source: "test",
  flightIata: "AI101",
  flightDate: "2026-09-20",
  status: "landed",
  departureDelayMinutes: 0,
  arrivalDelayMinutes: 0,
  extractedBy: "parser",
  ...over,
});

test("flight rule", () => {
  assert.equal(decideFlight(rec({ status: "cancelled" }), 120).decision, "approve");
  assert.equal(decideFlight(rec({ status: "diverted" }), 120).decision, "approve");
  assert.equal(decideFlight(rec({ arrivalDelayMinutes: 150 }), 120).decision, "approve");
  // early arrival does not cancel a late departure
  assert.equal(decideFlight(rec({ departureDelayMinutes: 130, arrivalDelayMinutes: -5 }), 120).decision, "approve");
  assert.equal(decideFlight(rec({ arrivalDelayMinutes: 119 }), 120).decision, "reject");
  // not landed yet and under threshold → wait
  assert.equal(decideFlight(rec({ status: "active", arrivalDelayMinutes: null, departureDelayMinutes: 30 }), 120).decision, "defer");
  // already past threshold while still in the air → no need to wait
  assert.equal(decideFlight(rec({ status: "active", arrivalDelayMinutes: null, departureDelayMinutes: 200 }), 120).decision, "approve");
});

test("aviationstack parser matches flight + date and computes delay", () => {
  const body = {
    data: [
      {
        flight_date: "2026-09-20",
        flight_status: "landed",
        flight: { iata: "AI101", codeshared: null },
        departure: { scheduled: "2026-09-20T01:00:00+00:00", actual: "2026-09-20T03:10:00+00:00" },
        arrival: { scheduled: "2026-09-20T09:00:00+00:00", actual: "2026-09-20T11:05:00+00:00", delay: 125 },
      },
      { flight_date: "2026-09-19", flight_status: "landed", flight: { iata: "AI101" }, departure: {}, arrival: {} },
      { flight_date: "2026-09-20", flight_status: "landed", flight: { iata: "UA9999" }, departure: {}, arrival: {} },
    ],
  };
  const records = parseAviationstack(body, "ai101", "2026-09-20");
  assert.equal(records.length, 1);
  assert.equal(records[0].arrivalDelayMinutes, 125);
  assert.equal(records[0].departureDelayMinutes, 130);
});

test("aerodatabox parser handles utc/local time objects", () => {
  const body = [
    {
      number: "AI 101",
      status: "Arrived",
      codeshareStatus: "IsOperator",
      departure: { scheduledTime: { utc: "2026-09-20 01:00Z", local: "2026-09-20 06:30+05:30" }, revisedTime: { utc: "2026-09-20 01:20Z" } },
      arrival: { scheduledTime: { utc: "2026-09-20 09:00Z" }, revisedTime: { utc: "2026-09-20 12:30Z" } },
    },
  ];
  const [r] = parseAerodatabox(body, "AI101", "2026-09-20");
  assert.equal(r.status, "landed");
  assert.equal(r.arrivalDelayMinutes, 210);
});

test("codeshare records lose to the operating carrier", () => {
  const picked = pickRecord([rec({ codeshared: true, arrivalDelayMinutes: 999 }), rec({ codeshared: false })]);
  assert.equal(picked?.codeshared, false);
});

test("gemini extraction is only accepted for the exact flight and date", () => {
  assert.equal(acceptGeminiRecord({ found: true, flightIata: "AI101", flightDate: "2026-09-20" }, "AI101", "2026-09-20"), true);
  assert.equal(acceptGeminiRecord({ found: true, flightIata: "AI102", flightDate: "2026-09-20" }, "AI101", "2026-09-20"), false);
  assert.equal(acceptGeminiRecord({ found: true, flightIata: "AI101", flightDate: "2026-09-21" }, "AI101", "2026-09-20"), false);
  assert.equal(acceptGeminiRecord({ found: false, flightIata: "AI101", flightDate: "2026-09-20" }, "AI101", "2026-09-20"), false);
});

test("model output with fences or prose still parses", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! Here it is: {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.throws(() => extractJson("no json here"));
});

test("evidence hash is independent of key order", () => {
  assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
  assert.deepEqual(hashEvidence({ x: 1, y: 2 }).hash, hashEvidence({ y: 2, x: 1 }).hash);
});

test("weather: days the first source leaves blank are filled from the next", async () => {
  const fakeFetch = (async (url: string) => {
    if (url.includes("api.open-meteo.com/v1/forecast")) {
      return new Response(JSON.stringify({ daily: { time: ["2026-07-16", "2026-07-17"], precipitation_sum: [null, 3] } }));
    }
    return new Response(JSON.stringify({ daily: { time: ["2026-07-16", "2026-07-17"], precipitation_sum: [9, 4] } }));
  }) as typeof fetch;
  const s = await fetchDailyRainfall(10, 20, "2026-07-16", "2026-07-17", fakeFetch, new Date("2026-08-20"));
  assert.deepEqual(s.days, [{ date: "2026-07-16", mm: 9 }, { date: "2026-07-17", mm: 3 }]);
  assert.match(s.source, /forecast.*\+.*archive/);
});
