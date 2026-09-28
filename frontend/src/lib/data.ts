import type { Program } from '@coral-xyz/anchor';
import { PublicKey, type GetProgramAccountsFilter } from '@solana/web3.js';
import type { Insure } from '../../idl/insure';
import { BACKEND_URL, sizeFilter, type ClaimAccount, type PolicyAccount, type VaultAccount } from './anchor';

type Kind = 'vault' | 'policyHolder' | 'claim';
type AccountOf<K extends Kind> = K extends 'vault' ? VaultAccount : K extends 'policyHolder' ? PolicyAccount : ClaimAccount;
export interface Row<T> {
  publicKey: PublicKey;
  account: T;
}

/**
 * The backend serves cached raw account bytes; we decode them with the same IDL
 * coder, so callers get identical objects either way. If the backend is down or
 * slow we fall back to scanning the chain directly.
 */
async function load<K extends Kind>(
  program: Program<Insure>,
  kind: K,
  path: string,
  rpcFilters: GetProgramAccountsFilter[],
  opts: LoadOptions = {}
): Promise<Row<AccountOf<K>>[]> {
  try {
    if (opts.fresh) throw new Error('fresh read requested');
    const res = await fetch(`${BACKEND_URL}${path}`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(String(res.status));
    const rows: { address: string; data: string }[] = await res.json();
    return rows.map((r) => ({
      publicKey: new PublicKey(r.address),
      account: program.coder.accounts.decode(kind, Buffer.from(r.data, 'base64')) as AccountOf<K>,
    }));
  } catch {
    const rows = await program.account[kind].all([sizeFilter(program, kind), ...rpcFilters]);
    return rows as unknown as Row<AccountOf<K>>[];
  }
}

export interface LoadOptions {
  /** Skip the backend's short cache and read the chain directly, e.g. right after the user's own transaction. */
  fresh?: boolean;
}

const at = (offset: number, key: PublicKey): GetProgramAccountsFilter => ({ memcmp: { offset, bytes: key.toBase58() } });

// Offsets: Vault.authority @8; PolicyHolder/Claim.vault @8, owner/claimant @40.
export const loadVaults = (program: Program<Insure>, authority?: PublicKey, opts?: LoadOptions) =>
  load(program, 'vault', authority ? `/raw/vaults?authority=${authority.toBase58()}` : '/raw/vaults', authority ? [at(8, authority)] : [], opts);

export const loadPoliciesForVault = (program: Program<Insure>, vault: PublicKey, opts?: LoadOptions) =>
  load(program, 'policyHolder', `/raw/policies?vault=${vault.toBase58()}`, [at(8, vault)], opts);

export const loadPolicies = (program: Program<Insure>, owner: PublicKey, opts?: LoadOptions) =>
  load(program, 'policyHolder', `/raw/policies?owner=${owner.toBase58()}`, [at(40, owner)], opts);

export const loadClaimsForVault = (program: Program<Insure>, vault: PublicKey) =>
  load(program, 'claim', `/raw/claims?vault=${vault.toBase58()}`, [at(8, vault)]);

export const loadClaimsForClaimant = (program: Program<Insure>, claimant: PublicKey) =>
  load(program, 'claim', `/raw/claims?claimant=${claimant.toBase58()}`, [at(40, claimant)]);

export async function loadRecentClaims(program: Program<Insure>, limit = 6): Promise<Row<ClaimAccount>[]> {
  const rows = await load(program, 'claim', `/raw/claims/recent?limit=${limit}`, []);
  return rows
    .sort((a, b) => Math.max(b.account.settledAt.toNumber(), b.account.filedAt.toNumber()) - Math.max(a.account.settledAt.toNumber(), a.account.filedAt.toNumber()))
    .slice(0, limit);
}

export interface ProtocolStats {
  vaults: number;
  openVaults: number;
  totalLiquidity: number;
  activePolicies: number;
  totalPolicies: number;
  premiumsCollected: number;
  claimsPaid: number;
  claimsFiled: number;
  claimsApproved: number;
  claimsPending: number;
}

export async function loadStats(program: Program<Insure>): Promise<ProtocolStats> {
  try {
    const res = await fetch(`${BACKEND_URL}/stats`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    const now = Math.floor(Date.now() / 1000);
    const [vaults, claims] = await Promise.all([loadVaults(program), load(program, 'claim', '/raw/claims/recent?limit=50', [])]);
    const sum = (f: (v: VaultAccount) => { toNumber(): number }) => vaults.reduce((s, v) => s + f(v.account).toNumber(), 0);
    return {
      vaults: vaults.length,
      openVaults: vaults.filter(({ account: v }) => !v.isClosed && !v.isPaused && now >= v.subscriptionStart.toNumber() && now <= v.subscriptionEnd.toNumber()).length,
      totalLiquidity: sum((v) => v.totalLiquidity),
      activePolicies: sum((v) => v.activePolicies),
      totalPolicies: sum((v) => v.totalPolicies),
      premiumsCollected: sum((v) => v.totalPremiumsCollected),
      claimsPaid: sum((v) => v.totalClaimsPaid),
      claimsFiled: claims.length,
      claimsApproved: claims.filter((c) => 'approved' in c.account.status).length,
      claimsPending: claims.filter((c) => 'pending' in c.account.status).length,
    };
  }
}
