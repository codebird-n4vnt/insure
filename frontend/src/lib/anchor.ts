import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import IDL from "../../idl/insure.json";
import type { Insure } from "../../idl/insure";

export const PROGRAM_ID = new PublicKey("8c1CfhXgqjKJct4kgoupTHCWk7TnK3MeLjRSV2KqqCsw");
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const connection = new Connection(RPC_URL, "confirmed");

export function getProgram(provider: AnchorProvider) {
  // Anchor v0.30+ reads programId from IDL "address" field — do NOT pass it as 3rd arg
  return new Program<Insure>(IDL as any, provider);
}

// On-chain seeds: [b"vault", authority]  — no trigger type or count
export function vaultPDA(authority: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), authority.toBuffer()],
    PROGRAM_ID
  );
}

export function vaultTreasuryPDA(vault: PublicKey) {
  // On-chain seeds: [b"treasury", vault]  — NOT "vault_treasury"
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), vault.toBuffer()],
    PROGRAM_ID
  );
}

export function policyPDA(vault: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), vault.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  );
}

export function claimPDA(vault: PublicKey, claimant: PublicKey, claimNumber: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("claim"),
      vault.toBuffer(),
      claimant.toBuffer(),
      claimNumber.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

export const USDC_DECIMALS = 6;

export function toUSDC(amount: number): BN {
  return new BN(Math.floor(amount * Math.pow(10, USDC_DECIMALS)));
}

export function fromUSDC(amount: BN | number): number {
  const n = typeof amount === "number" ? amount : amount.toNumber();
  return n / Math.pow(10, USDC_DECIMALS);
}

export function formatUSDC(amount: BN | number): string {
  const n = fromUSDC(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function triggerTypeLabel(triggerType: any): "Weather" | "FlightDelay" {
  if ("weather" in triggerType) return "Weather";
  return "FlightDelay";
}
