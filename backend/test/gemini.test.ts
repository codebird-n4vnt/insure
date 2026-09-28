import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, Type } from "@google/genai";
import { extractFlightWithGemini, geminiJson, validateFlight, type GeminiClient } from "../src/oracle/gemini";

type Reply = string | Error | undefined;

/** A fake Gemini that plays back scripted replies per model and records calls. */
function fakeGemini(script: Record<string, Reply[]>) {
  const calls: string[] = [];
  const client: GeminiClient = {
    models: {
      async generateContent(req) {
        calls.push(req.model);
        const next = script[req.model]?.shift();
        if (next instanceof Error) throw next;
        return { text: next, candidates: [{ finishReason: next === undefined ? "SAFETY" : "STOP" }] };
      },
    },
  };
  return { client, calls };
}

const noSleep = async () => {};
const schema = { type: Type.OBJECT, properties: { n: { type: Type.NUMBER } } };
const validN = (raw: unknown) => {
  const n = (raw as { n?: unknown })?.n;
  if (typeof n !== "number") throw new Error("validation: n");
  return n;
};

test("gemini: fenced JSON is parsed on the first try", async () => {
  const { client, calls } = fakeGemini({ a: ["```json\n{\"n\": 7}\n```"] });
  const r = await geminiJson("p", schema, validN, { client, models: ["a"], sleep: noSleep });
  assert.deepEqual(r, { value: 7, model: "a" });
  assert.deepEqual(calls, ["a"]);
});

test("gemini: rate limits are retried with backoff on the same model", async () => {
  const waits: number[] = [];
  const { client, calls } = fakeGemini({ a: [new ApiError({ message: "quota", status: 429 }), new ApiError({ message: "busy", status: 503 }), '{"n":1}'] });
  const r = await geminiJson("p", schema, validN, { client, models: ["a"], sleep: async (ms) => void waits.push(ms) });
  assert.equal(r?.value, 1);
  assert.deepEqual(calls, ["a", "a", "a"]);
  assert.deepEqual(waits, [1000, 2000]);
});

test("gemini: a retired model (404) falls through to the next model immediately", async () => {
  const { client, calls } = fakeGemini({ old: [new ApiError({ message: "not found", status: 404 })], next: ['{"n":2}'] });
  const r = await geminiJson("p", schema, validN, { client, models: ["old", "next"], sleep: noSleep });
  assert.deepEqual(r, { value: 2, model: "next" });
  assert.deepEqual(calls, ["old", "next"]);
});

test("gemini: schema-invalid answers are retried, then give up cleanly", async () => {
  const { client, calls } = fakeGemini({ a: ['{"n":"seven"}', "not json at all", '{"m":1}'] });
  const r = await geminiJson("p", schema, validN, { client, models: ["a"], sleep: noSleep });
  assert.equal(r, null);
  assert.equal(calls.length, 3);
});

test("gemini: empty (safety-blocked) response moves on to the next model", async () => {
  const { client, calls } = fakeGemini({ a: [undefined], b: ['{"n":3}'] });
  const r = await geminiJson("p", schema, validN, { client, models: ["a", "b"], sleep: noSleep });
  assert.equal(r?.model, "b");
  assert.deepEqual(calls, ["a", "b"]);
});

test("gemini: no API key means no calls and a null result", async () => {
  assert.equal(await geminiJson("p", schema, validN, { client: null }), null);
});

test("flight extraction: out-of-range delays are rejected, strings coerced", () => {
  assert.throws(() => validateFlight({ found: true, status: "landed", departureDelayMinutes: 99999, arrivalDelayMinutes: 0 }));
  assert.throws(() => validateFlight({ found: true, status: "teleported", departureDelayMinutes: 0, arrivalDelayMinutes: 0 }));
  const v = validateFlight({ found: true, status: "landed", flightIata: "ai 101", flightDate: "2026-09-20", departureDelayMinutes: "130.4", arrivalDelayMinutes: null });
  assert.equal(v.flightIata, "AI101");
  assert.equal(v.departureDelayMinutes, 130);
  assert.equal(v.arrivalDelayMinutes, null);
});

test("flight extraction end to end with a fake model", async () => {
  const { client } = fakeGemini({
    m: ['Here you go: {"found":true,"status":"cancelled","flightIata":"AI101","flightDate":"2026-09-20","departureDelayMinutes":null,"arrivalDelayMinutes":null}'],
  });
  const r = await extractFlightWithGemini({ data: [] }, "AI101", "2026-09-20", { client, models: ["m"], sleep: noSleep });
  assert.equal(r?.value.status, "cancelled");
});

test("explanations never delay a payout: a hung model is abandoned within the budget", async () => {
  const { explainDecision } = await import("../src/oracle/gemini");
  const hung: GeminiClient = { models: { generateContent: () => new Promise(() => {}) } };
  const t0 = Date.now();
  const r = await explainDecision("Drought trigger met", { mm: 3 }, { client: hung, models: ["m"], sleep: noSleep }, 150);
  assert.equal(r, null);
  assert.ok(Date.now() - t0 < 1_000);
});

test("explanations are trimmed and length-capped", async () => {
  const { explainDecision } = await import("../src/oracle/gemini");
  const { client } = fakeGemini({ m: [JSON.stringify({ explanation: "  " + "x".repeat(2_000) + "  " })] });
  const r = await explainDecision("s", {}, { client, models: ["m"], sleep: noSleep });
  assert.equal(r?.length, 600);
});
