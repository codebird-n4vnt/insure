import bs58 from "bs58";
import type { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import IDL from "../types/insure.json";
import { PROGRAM_ID, connection, program } from "./chain";

export type Kind = "vault" | "policyHolder" | "claim";

/**
 * Exact on-chain sizes (8 + INIT_SPACE). Anchor's TS `account.size` is wrong for
 * PolicyHolder/Claim because the IDL doesn't carry max_len for the String inside
 * InsuredRisk. Pinned by a Rust test (account_sizes_match_offchain_filters).
 */
export const ACCOUNT_SIZE: Record<Kind, number> = { vault: 233, policyHolder: 129, claim: 199 };

/** Byte offset of Claim.status (constants.rs CLAIM_STATUS_OFFSET); 0 = Pending. */
export const CLAIM_STATUS_OFFSET = 112;
export const PENDING_CLAIMS: GetProgramAccountsFilter = { memcmp: { offset: CLAIM_STATUS_OFFSET, bytes: bs58.encode([0]) } };
const IDL_NAME: Record<Kind, string> = { vault: "Vault", policyHolder: "PolicyHolder", claim: "Claim" };

export interface RawAccount {
  address: string;
  /** base64 account data; clients decode it with the program IDL. */
  data: string;
}

function discriminator(kind: Kind): string {
  const acc = IDL.accounts.find((a) => a.name === IDL_NAME[kind]);
  if (!acc) throw new Error(`No ${kind} in IDL`);
  return bs58.encode(Buffer.from(acc.discriminator));
}

const cache = new Map<string, { at: number; value: RawAccount[] }>();
const inflight = new Map<string, Promise<RawAccount[]>>();

/**
 * getProgramAccounts with the discriminator + current-layout size filters.
 * Short cache and request coalescing so a burst of page loads costs one RPC call.
 */
export async function rawAccounts(kind: Kind, filters: GetProgramAccountsFilter[] = [], ttlMs = 5_000): Promise<RawAccount[]> {
  const key = `${kind}:${JSON.stringify(filters)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = connection
    .getProgramAccounts(PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { dataSize: ACCOUNT_SIZE[kind] },
        { memcmp: { offset: 0, bytes: discriminator(kind) } },
        ...filters,
      ],
    })
    .then((rows) => {
      const value = rows.map((r) => ({ address: r.pubkey.toBase58(), data: r.account.data.toString("base64") }));
      cache.set(key, { at: Date.now(), value });
      if (cache.size > 2_000) cache.clear();
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const byField = (offset: number, key: PublicKey): GetProgramAccountsFilter => ({
  memcmp: { offset, bytes: key.toBase58() },
});

export function decode<K extends Kind>(kind: K, row: RawAccount) {
  return program.coder.accounts.decode(kind, Buffer.from(row.data, "base64"));
}

/** Headline numbers for the landing page. */
export async function protocolStats() {
  const now = Math.floor(Date.now() / 1000);
  const [vaultRows, claimRows] = await Promise.all([rawAccounts("vault", [], 15_000), rawAccounts("claim", [], 15_000)]);
  const vaults = vaultRows.map((r) => decode("vault", r));
  const claims = claimRows.map((r) => decode("claim", r));
  const sum = (f: (v: (typeof vaults)[number]) => { toNumber(): number }) => vaults.reduce((s, v) => s + f(v).toNumber(), 0);
  return {
    vaults: vaults.length,
    openVaults: vaults.filter(
      (v) => !v.isClosed && !v.isPaused && now >= v.subscriptionStart.toNumber() && now <= v.subscriptionEnd.toNumber()
    ).length,
    totalLiquidity: sum((v) => v.totalLiquidity),
    activePolicies: sum((v) => v.activePolicies),
    totalPolicies: sum((v) => v.totalPolicies),
    premiumsCollected: sum((v) => v.totalPremiumsCollected),
    claimsPaid: sum((v) => v.totalClaimsPaid),
    claimsFiled: claims.length,
    claimsApproved: claims.filter((c) => "approved" in c.status).length,
    claimsPending: claims.filter((c) => "pending" in c.status).length,
  };
}

/** Most recent claims (settled first by settle time, then pending by filing time). */
export async function recentClaims(limit: number): Promise<RawAccount[]> {
  const rows = await rawAccounts("claim", [], 15_000);
  const t = (r: RawAccount) => {
    const c = decode("claim", r);
    return Math.max(c.settledAt.toNumber(), c.filedAt.toNumber());
  };
  return rows
    .map((r) => ({ r, t: t(r) }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map((x) => x.r);
}
