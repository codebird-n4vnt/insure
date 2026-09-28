import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { program, seeds } from "./chain";
import { ACCOUNT_SIZE } from "./raw";

// Accounts created by older program versions have a different size; skip them instead of failing to decode.
const size = (kind: "vault" | "policyHolder" | "claim") => ({ dataSize: ACCOUNT_SIZE[kind] });

/** BN → number, PublicKey → base58, enums like {pending:{}} → "pending", byte arrays → hex. */
export function toJson(value: any): any {
  if (value === null || value === undefined) return value;
  if (BN.isBN(value)) return value.toNumber();
  if (value instanceof PublicKey) return value.toBase58();
  if (Array.isArray(value)) {
    if (value.length === 32 && value.every((b) => Number.isInteger(b) && b >= 0 && b < 256)) {
      return Buffer.from(value).toString("hex");
    }
    return value.map(toJson);
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 1 && value[keys[0]] && typeof value[keys[0]] === "object" && Object.keys(value[keys[0]]).length === 0) {
      return keys[0];
    }
    return Object.fromEntries(keys.map((k) => [k, toJson(value[k])]));
  }
  return value;
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function parseKey(s: string): PublicKey | null {
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}

const withAddress = ({ publicKey, account }: { publicKey: PublicKey; account: unknown }) => ({
  address: publicKey.toBase58(),
  ...toJson(account),
});

export const getAllVaults = () =>
  cached("vaults", 15_000, async () => (await program.account.vault.all([size("vault")])).map(withAddress));

export async function getVault(vault: PublicKey) {
  const acc = await program.account.vault.fetchNullable(vault);
  return acc ? { address: vault.toBase58(), ...toJson(acc) } : null;
}

// PolicyHolder and Claim both start with `vault: Pubkey` right after the discriminator.
export const getPoliciesForVault = (vault: PublicKey) =>
  cached(`policies:${vault}`, 15_000, async () =>
    (await program.account.policyHolder.all([size("policyHolder"), { memcmp: { offset: 8, bytes: vault.toBase58() } }])).map(withAddress)
  );

export const getClaimsForVault = (vault: PublicKey) =>
  cached(`claims:${vault}`, 10_000, async () =>
    (await program.account.claim.all([size("claim"), { memcmp: { offset: 8, bytes: vault.toBase58() } }])).map(withAddress)
  );

export async function getUserPolicy(vault: PublicKey, wallet: PublicKey) {
  const key = seeds.policy(vault, wallet);
  const acc = await program.account.policyHolder.fetchNullable(key);
  return acc ? { address: key.toBase58(), ...toJson(acc) } : null;
}

// PolicyHolder.owner and Claim.claimant both sit at offset 8 + 32.
export const getUserPolicies = (wallet: PublicKey) =>
  program.account.policyHolder
    .all([size("policyHolder"), { memcmp: { offset: 40, bytes: wallet.toBase58() } }])
    .then((rows) => rows.map(withAddress));

export const getUserClaims = (wallet: PublicKey) =>
  program.account.claim
    .all([size("claim"), { memcmp: { offset: 40, bytes: wallet.toBase58() } }])
    .then((rows) => rows.map(withAddress));

export async function getConfig() {
  const acc = await program.account.config.fetchNullable(seeds.config());
  return acc ? toJson(acc) : null;
}
