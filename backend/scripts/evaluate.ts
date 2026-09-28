/**
 * Dry-run the oracle against live data without touching the chain.
 *
 *   npm run evaluate -- weather <lat> <lon> <observationDays> <thresholdMm> [filedAtISO]
 *   npm run evaluate -- flight <FLIGHT> <YYYY-MM-DD> <thresholdMinutes>
 */
import { evaluateClaim } from "../src/oracle/evaluate";
import { explainDecision } from "../src/oracle/gemini";
import type { ClaimContext } from "../src/oracle/types";

async function main() {
  const [kind, ...a] = process.argv.slice(2);
  const base = { claim: "dry-run", vault: "-", claimant: "-", claimNumber: 0, coveredFrom: 0, personalCoverageEnd: Number.MAX_SAFE_INTEGER };
  let ctx: ClaimContext;
  if (kind === "weather") {
    const filedAt = a[4] ? Math.floor(Date.parse(a[4]) / 1000) : Math.floor(Date.now() / 1000);
    ctx = {
      ...base,
      filedAt,
      observationDays: Number(a[2]),
      threshold: Number(a[3]),
      risk: { kind: "weather", latitude: Number(a[0]), longitude: Number(a[1]) },
    };
  } else if (kind === "flight") {
    ctx = {
      ...base,
      filedAt: Math.floor(Date.now() / 1000),
      observationDays: 0,
      threshold: Number(a[2]),
      risk: { kind: "flight", flightNumber: a[0].toUpperCase(), flightDate: a[1] },
    };
  } else {
    throw new Error("usage: evaluate weather <lat> <lon> <days> <mm> [filedAt] | flight <FLIGHT> <date> <minutes>");
  }

  const outcome = await evaluateClaim(ctx);
  if (outcome.decision === "defer") {
    console.log("DEFER:", outcome.reason);
    return;
  }
  const { data, ...rest } = outcome;
  console.log(JSON.stringify(rest, null, 2));
  console.log("data:", JSON.stringify(data).slice(0, 800));
  const why = await explainDecision(outcome.summary, { risk: ctx.risk, observedValue: outcome.observedValue, threshold: ctx.threshold });
  console.log("explanation:", why ?? "(Gemini not configured or unavailable)");
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
