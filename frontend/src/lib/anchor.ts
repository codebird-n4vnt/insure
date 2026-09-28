import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, BN, Program, type IdlAccounts } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import IDL from "../../idl/insure.json";
import type { Insure } from "../../idl/insure";

export type VaultAccount = IdlAccounts<Insure>["vault"];
export type PolicyAccount = IdlAccounts<Insure>["policyHolder"];
export type ClaimAccount = IdlAccounts<Insure>["claim"];
export type Region = VaultAccount["region"];

export const PROGRAM_ID = new PublicKey(IDL.address);
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || undefined;
export const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";
export const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, "");

export const DAY = 86_400;
export const USDC_DECIMALS = 6;
/** Mirrors constants.rs */
export const ORACLE_FEE = 5_000;
export const MAX_CREATOR_FEE_BPS = 5_000;
export const CLAIM_FILING_GRACE = 7 * DAY;
/** Renewals are accepted this long after paid coverage ends. */
export const GRACE_PERIOD = 10 * DAY;

export function getProgram(provider: AnchorProvider) {
  // Anchor v0.30+ reads programId from the IDL "address" field.
  return new Program<Insure>(IDL as Insure, provider);
}

/** For reads when no wallet is connected. */
export function readonlyProgram(connection: Connection) {
  const kp = Keypair.generate();
  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async <T,>(tx: T) => tx,
    signAllTransactions: async <T,>(txs: T[]) => txs,
  };
  return getProgram(new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
}

/**
 * Exact on-chain sizes (8 + INIT_SPACE). Anchor's TS `account.size` is wrong for
 * PolicyHolder/Claim (the IDL lacks max_len for the String inside InsuredRisk);
 * pinned by a Rust test. Also skips accounts left by older program versions.
 */
export const ACCOUNT_SIZE = { vault: 233, policyHolder: 129, claim: 199 } as const;
export const sizeFilter = (_program: Program<Insure>, kind: keyof typeof ACCOUNT_SIZE) => ({ dataSize: ACCOUNT_SIZE[kind] });

// ─── PDAs (must match seeds in lib.rs) ─────────────────────────────────────

export const configPDA = () => PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];

export const vaultPDA = (authority: PublicKey, vaultId: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), authority.toBuffer(), vaultId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];

export const vaultTreasuryPDA = (vault: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("treasury"), vault.toBuffer()], PROGRAM_ID)[0];

export const policyPDA = (vault: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("policy"), vault.toBuffer(), owner.toBuffer()], PROGRAM_ID)[0];

export const claimPDA = (vault: PublicKey, claimant: PublicKey, claimNumber: BN) =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("claim"), vault.toBuffer(), claimant.toBuffer(), claimNumber.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  )[0];

export const usdcAta = (owner: PublicKey, mint: PublicKey = USDC_MINT) => getAssociatedTokenAddressSync(mint, owner, true);

// ─── money ─────────────────────────────────────────────────────────────────

/** Parse a decimal string exactly (no float rounding): "12.5" → 12_500_000. */
export function toUSDC(amount: string): BN {
  const s = amount.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(s)) throw new Error(`Invalid USDC amount "${amount}" (max 6 decimals)`);
  const [whole, frac = ""] = s.split(".");
  return new BN(whole + frac.padEnd(USDC_DECIMALS, "0"));
}

export function fromUSDC(amount: BN | number): number {
  const n = typeof amount === "number" ? amount : Number(amount.toString());
  return n / 10 ** USDC_DECIMALS;
}

export function formatUSDC(amount: BN | number): string {
  const n = fromUSDC(amount);
  // Sub-cent amounts (e.g. the 0.005 USDC claim fee) must show exactly, not round to $0.01.
  const tiny = n > 0 && n < 0.01;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: tiny ? USDC_DECIMALS : 2,
  }).format(n);
}

// ─── display helpers ───────────────────────────────────────────────────────

export function formatUSDCompact(amount: BN | number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(fromUSDC(amount));
}

/** "in 2d 4h", "3h ago", "in 12m" */
export function relativeTime(unix: number, now = Math.floor(Date.now() / 1000)): string {
  const diff = unix - now;
  const a = Math.abs(diff);
  const d = Math.floor(a / DAY), h = Math.floor((a % DAY) / 3600), m = Math.floor((a % 3600) / 60);
  const txt = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
  return diff >= 0 ? `in ${txt}` : `${txt} ago`;
}

export const regionCenter = (r: Region) => ({
  lat: (r.minLatE6 + r.maxLatE6) / 2e6,
  lon: (r.minLonE6 + r.maxLonE6) / 2e6,
});

export const inRegion = (r: Region, lat: number, lon: number) => {
  const la = Math.round(lat * 1e6), lo = Math.round(lon * 1e6);
  return la >= r.minLatE6 && la <= r.maxLatE6 && lo >= r.minLonE6 && lo <= r.maxLonE6;
};

export function regionLabel(r: Region): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v / 1e6).toFixed(2)}°${v >= 0 ? pos : neg}`;
  return `${f(r.minLatE6, "N", "S")}–${f(r.maxLatE6, "N", "S")}, ${f(r.minLonE6, "E", "W")}–${f(r.maxLonE6, "E", "W")}`;
}

/** Where a vault sits in its lifecycle. */
export type VaultPhase = "upcoming" | "open" | "covering" | "settling" | "closed";
export function vaultPhase(v: VaultAccount, now = Math.floor(Date.now() / 1000)): VaultPhase {
  if (v.isClosed) return "closed";
  if (now < v.subscriptionStart.toNumber()) return "upcoming";
  if (now <= v.subscriptionEnd.toNumber()) return "open";
  if (now <= v.coverageEnd.toNumber()) return "covering";
  return "settling";
}
export const PHASE_LABEL: Record<VaultPhase, string> = {
  upcoming: "Opens soon",
  open: "Open for cover",
  covering: "Coverage live",
  settling: "Settling claims",
  closed: "Closed",
};

/**
 * Mirrors release_lapsed_policy: a weather policy nobody can renew or claim on any more,
 * whose locked payout the underwriter can free.
 */
export function isReleasable(vault: VaultAccount, policy: PolicyAccount, now: number): boolean {
  if (!("weather" in policy.risk) || policy.paidOut || policy.released || policy.hasPendingClaim || vault.isClosed) return false;
  const end = policy.personalCoverageEnd.toNumber();
  const coveredUntil = Math.min(end, vault.coverageEnd.toNumber());
  return now > end + GRACE_PERIOD && now > coveredUntil + CLAIM_FILING_GRACE;
}

/** Policies the vault can still underwrite with its free liquidity. */
export const vaultCapacity = (v: VaultAccount) =>
  v.coverageAmount.isZero() ? 0 : Math.max(0, v.totalLiquidity.sub(v.activePolicies.mul(v.coverageAmount)).div(v.coverageAmount).toNumber());

export function formatDate(unix: number, withTime = false): string {
  return new Date(unix * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export const formatUtcDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

export function triggerTypeLabel(triggerType: object): "Weather" | "FlightDelay" {
  return "weather" in triggerType ? "Weather" : "FlightDelay";
}

export function triggerDescription(vault: VaultAccount): string {
  const t = vault.triggerThreshold.toNumber();
  return "weather" in vault.triggerType
    ? `Pays if rainfall over ${vault.observationDays} day${vault.observationDays === 1 ? "" : "s"} is below ${t} mm`
    : `Pays if the flight is cancelled, diverted, or ${t}+ min late`;
}

export type ClaimStatusVariant = "pending" | "approved" | "rejected";

export function claimStatusLabel(status: object): { label: string; variant: ClaimStatusVariant } {
  if ("approved" in status) return { label: "Approved", variant: "approved" };
  if ("rejected" in status) return { label: "Rejected", variant: "rejected" };
  return { label: "Pending", variant: "pending" };
}

export function riskSummary(risk: ClaimAccount["risk"]): string {
  if ("weather" in risk && risk.weather) {
    const { latitudeE6, longitudeE6 } = risk.weather;
    return `Farm at ${(latitudeE6 / 1e6).toFixed(4)}°, ${(longitudeE6 / 1e6).toFixed(4)}°`;
  }
  const f = (risk as { flightDelay: { flightNumber: string; flightDate: BN } }).flightDelay;
  return `Flight ${f.flightNumber} on ${formatUtcDate(f.flightDate.toNumber())}`;
}

/** Human-readable version of Claim.observed_value. */
export function observedLabel(claim: ClaimAccount): string | null {
  if ("pending" in claim.status) return null;
  const v = claim.observedValue.toNumber();
  if ("weather" in claim.risk) return `${(v / 10).toFixed(1)} mm rainfall measured`;
  if (v === -1) return "Flight cancelled";
  if (v === -2) return "Flight diverted";
  return `${v} min delay measured`;
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=${CLUSTER}`;
export const evidenceUrl = (claim: string) => `${BACKEND_URL}/evidence/${claim}`;

export const claimUrl = (claim: string) => `/claims/${claim}`;

/** Pull the readable part out of Anchor / wallet / RPC errors. */
export function errorMessage(err: unknown): string {
  const e = err as { logs?: string[]; transactionLogs?: string[]; message?: string; error?: { errorMessage?: string } };
  if (e?.error?.errorMessage) return e.error.errorMessage;
  for (const line of e?.logs ?? e?.transactionLogs ?? []) {
    const m = line.match(/Error Message: (.+)/);
    if (m) return m[1];
  }
  const msg = e?.message ?? "Transaction failed";
  if (/insufficient funds|0x1\b/i.test(msg)) return "Insufficient USDC balance. Get devnet USDC at faucet.circle.com.";
  if (/AccountNotInitialized|could not find account|owner_usdc|claimant_usdc|creator_usdc/i.test(msg)) {
    return "You don't have a USDC token account yet. Get devnet USDC at faucet.circle.com first.";
  }
  if (/User rejected/i.test(msg)) return "Transaction cancelled in wallet.";
  return msg.split("\n")[0];
}
