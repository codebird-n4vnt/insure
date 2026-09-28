export type Risk =
  | { kind: "weather"; latitude: number; longitude: number }
  | { kind: "flight"; flightNumber: string; /** YYYY-MM-DD */ flightDate: string };

/** Everything the oracle needs to decide a claim, read from chain. */
export interface ClaimContext {
  claim: string;
  vault: string;
  claimant: string;
  claimNumber: number;
  filedAt: number;
  coveredFrom: number;
  personalCoverageEnd: number;
  /** Weather: mm of rain over the window. Flight: minutes of delay. */
  threshold: number;
  observationDays: number;
  risk: Risk;
}

export type Decision = "approve" | "reject";

export interface Settled {
  decision: Decision;
  /** Weather: rainfall in 0.1 mm. Flight: delay in minutes, -1 cancelled, -2 diverted. */
  observedValue: number;
  /** One-line, human-readable rule outcome. */
  summary: string;
  /** The data the decision was made on (goes into the evidence bundle). */
  data: Record<string, unknown>;
}

export interface Deferred {
  decision: "defer";
  reason: string;
  data?: Record<string, unknown>;
}

export type Outcome = Settled | Deferred;

export type FetchFn = typeof fetch;
