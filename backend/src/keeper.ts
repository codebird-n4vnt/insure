import { BN, type IdlAccounts, type Program } from "@coral-xyz/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { Insure } from "../types/insure";
import { config } from "./config";
import { explainDecision } from "./oracle/gemini";
import { evaluateClaim } from "./oracle/evaluate";
import { hashEvidence, saveEvidence } from "./oracle/evidence";
import { isoDate } from "./oracle/weather";
import { ACCOUNT_SIZE, PENDING_CLAIMS } from "./raw";
import type { ClaimContext, Outcome, Risk, Settled } from "./oracle/types";

type ClaimAccount = IdlAccounts<Insure>["claim"];
type VaultAccount = IdlAccounts<Insure>["vault"];
type PolicyAccount = IdlAccounts<Insure>["policyHolder"];

export function decodeRisk(risk: ClaimAccount["risk"]): Risk {
  if ("weather" in risk && risk.weather) {
    return { kind: "weather", latitude: risk.weather.latitudeE6 / 1e6, longitude: risk.weather.longitudeE6 / 1e6 };
  }
  const f = (risk as any).flightDelay;
  return { kind: "flight", flightNumber: f.flightNumber, flightDate: isoDate(Number(f.flightDate)) };
}

export function claimContext(
  claimKey: PublicKey,
  claim: ClaimAccount,
  vault: VaultAccount,
  policy: PolicyAccount
): ClaimContext {
  return {
    claim: claimKey.toBase58(),
    vault: claim.vault.toBase58(),
    claimant: claim.claimant.toBase58(),
    claimNumber: claim.claimNumber.toNumber(),
    filedAt: claim.filedAt.toNumber(),
    coveredFrom: policy.coveredFrom.toNumber(),
    personalCoverageEnd: policy.personalCoverageEnd.toNumber(),
    threshold: vault.triggerThreshold.toNumber(),
    observationDays: vault.observationDays,
    risk: decodeRisk(claim.risk),
  };
}

export function buildSettleIx(
  program: Program<Insure>,
  oracle: PublicKey,
  claimKey: PublicKey,
  claim: Pick<ClaimAccount, "vault" | "policy" | "claimant">,
  usdcMint: PublicKey,
  approved: boolean,
  observedValue: number,
  evidenceHash: Buffer
): Promise<TransactionInstruction> {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  const [treasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), claim.vault.toBuffer()],
    program.programId
  );
  return program.methods
    .settleClaim(approved, new BN(observedValue), Array.from(evidenceHash))
    .accountsStrict({
      oracle,
      config,
      vault: claim.vault,
      policy: claim.policy,
      claim: claimKey,
      usdcMint,
      claimant: claim.claimant,
      claimantUsdc: getAssociatedTokenAddressSync(usdcMint, claim.claimant, true),
      vaultTreasury: treasury,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** Assemble the evidence bundle whose sha256 is written on-chain. */
export async function buildEvidence(ctx: ClaimContext, outcome: Settled, oracle: PublicKey, extra: Record<string, unknown> = {}) {
  const explanation = await explainDecision(outcome.summary, {
    risk: ctx.risk,
    observedValue: outcome.observedValue,
    threshold: ctx.threshold,
    summary: outcome.summary,
  }).catch(() => null);

  const bundle = {
    version: 1,
    claim: ctx.claim,
    vault: ctx.vault,
    claimant: ctx.claimant,
    claimNumber: ctx.claimNumber,
    risk: ctx.risk,
    rule:
      ctx.risk.kind === "weather"
        ? { type: "rainfall_below", thresholdMm: ctx.threshold, observationDays: ctx.observationDays }
        : { type: "delay_at_least_or_cancelled", thresholdMinutes: ctx.threshold },
    decision: outcome.decision,
    observedValue: outcome.observedValue,
    summary: outcome.summary,
    explanation,
    data: outcome.data,
    oracle: oracle.toBase58(),
    decidedAt: new Date().toISOString(),
    ...extra,
  };
  return { bundle, ...hashEvidence(bundle) };
}

const LOW_BALANCE_SOL = 0.05;

interface Deferral {
  attempts: number;
  nextAt: number;
  lastReason: string;
}

export class Keeper {
  private inFlight = new Set<string>();
  private deferrals = new Map<string, Deferral>();
  private timer: NodeJS.Timeout | null = null;
  private listenerId: number | null = null;
  private usdcMint: PublicKey | null = null;
  public lastSweepAt = 0;
  public lastError = "";
  /** SOL left to pay settlement fees and ATA rent; surfaced on /health for alerting. */
  public oracleBalanceSol: number | null = null;

  constructor(
    private program: Program<Insure>,
    private oracle: Keypair
  ) {}

  status() {
    return {
      oracle: this.oracle.publicKey.toBase58(),
      running: this.timer !== null,
      oracleBalanceSol: this.oracleBalanceSol,
      oracleBalanceLow: this.oracleBalanceSol !== null && this.oracleBalanceSol < LOW_BALANCE_SOL,
      lastSweepAt: this.lastSweepAt ? new Date(this.lastSweepAt).toISOString() : null,
      inFlight: [...this.inFlight],
      deferred: Object.fromEntries(
        [...this.deferrals].map(([k, d]) => [k, { ...d, nextAt: new Date(d.nextAt).toISOString() }])
      ),
      lastError: this.lastError || null,
    };
  }

  async start(): Promise<void> {
    const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], this.program.programId)[0];
    const cfg = await this.program.account.config.fetchNullable(configPda);
    if (!cfg) {
      throw new Error("Config account not found. Run `npm run init-config` with the program's upgrade authority first.");
    }
    if (!cfg.oracleAuthority.equals(this.oracle.publicKey)) {
      throw new Error(
        `ORACLE_KEYPAIR is ${this.oracle.publicKey.toBase58()} but the on-chain oracle is ${cfg.oracleAuthority.toBase58()}.`
      );
    }
    this.usdcMint = cfg.usdcMint;

    await this.checkBalance();

    this.listenerId = this.program.addEventListener("claimFiled", (e) => {
      console.log(`[keeper] ClaimFiled ${e.claim.toBase58()}`);
      void this.processClaim(e.claim);
    });
    const tick = async () => {
      await this.sweep().catch((e) => {
        this.lastError = e?.message ?? String(e);
        console.error("[keeper] sweep failed:", this.lastError);
      });
      this.timer = setTimeout(tick, config.pollIntervalSeconds * 1000);
    };
    this.timer = setTimeout(tick, 0);
    console.log(`[keeper] running as oracle ${this.oracle.publicKey.toBase58()}`);
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.listenerId !== null) await this.program.removeEventListener(this.listenerId);
  }

  private async checkBalance(): Promise<void> {
    const lamports = await this.program.provider.connection.getBalance(this.oracle.publicKey);
    this.oracleBalanceSol = lamports / 1e9;
    if (this.oracleBalanceSol < LOW_BALANCE_SOL) {
      console.warn(`[keeper] oracle balance is low (${this.oracleBalanceSol} SOL); settlements pay fees and ATA rent. Top up ${this.oracle.publicKey.toBase58()}.`);
    }
  }

  /** Catch anything the websocket missed (restarts, dropped connections). */
  async sweep(): Promise<void> {
    // Only pending claims are fetched (status has a fixed offset), so this stays cheap as history grows.
    const pending = await this.program.account.claim.all([{ dataSize: ACCOUNT_SIZE.claim }, PENDING_CLAIMS]);
    this.lastSweepAt = Date.now();
    await this.checkBalance().catch(() => {});
    for (const c of pending) {
      const d = this.deferrals.get(c.publicKey.toBase58());
      if (d && Date.now() < d.nextAt) continue;
      await this.processClaim(c.publicKey);
    }
  }

  async processClaim(claimKey: PublicKey): Promise<void> {
    const id = claimKey.toBase58();
    if (this.inFlight.has(id)) return;
    this.inFlight.add(id);
    try {
      const claim = await this.program.account.claim.fetch(claimKey);
      if (!("pending" in claim.status)) {
        this.deferrals.delete(id);
        return;
      }
      const [vault, policy] = await Promise.all([
        this.program.account.vault.fetch(claim.vault),
        this.program.account.policyHolder.fetch(claim.policy),
      ]);
      const ctx = claimContext(claimKey, claim, vault, policy);
      let outcome: Outcome = await evaluateClaim(ctx);

      if (outcome.decision === "defer") {
        const ageHours = (Date.now() / 1000 - ctx.filedAt) / 3600;
        if (ageHours < config.dataDeadlineHours) {
          const prev = this.deferrals.get(id);
          const attempts = (prev?.attempts ?? 0) + 1;
          const delayMs = Math.min(5 * 60_000 * 2 ** (attempts - 1), 3 * 3600_000);
          this.deferrals.set(id, { attempts, nextAt: Date.now() + delayMs, lastReason: outcome.reason });
          console.log(`[keeper] ${id} deferred (#${attempts}, retry in ${Math.round(delayMs / 60000)}m): ${outcome.reason}`);
          return;
        }
        // Don't hold the vault hostage forever. A rejection lets the claimant re-file.
        outcome = {
          decision: "reject",
          observedValue: 0,
          summary: `No verifiable data within ${config.dataDeadlineHours}h of filing: ${outcome.reason}. You may file again.`,
          data: outcome.data ?? {},
        };
      }

      // The underwriter force-closed the vault (only possible after the oracle was down
      // for 7+ days past expiry). A payout can no longer land; record the outcome
      // instead of retrying forever.
      if (outcome.decision === "approve" && vault.isClosed) {
        outcome = {
          ...outcome,
          decision: "reject",
          summary: `${outcome.summary} However, the vault was closed by its underwriter before this claim could be settled, so no payout is possible.`,
        };
      }

      const { hash, canonical } = await buildEvidence(ctx, outcome, this.oracle.publicKey);
      saveEvidence(id, canonical);

      const ix = await buildSettleIx(
        this.program,
        this.oracle.publicKey,
        claimKey,
        claim,
        this.usdcMint ?? vault.usdcMint,
        outcome.decision === "approve",
        outcome.observedValue,
        hash
      );
      const sig = await this.program.provider.sendAndConfirm!(
        new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }), ix),
        [],
        { commitment: "confirmed" }
      );
      this.deferrals.delete(id);
      console.log(`[keeper] ${id} ${outcome.decision.toUpperCase()} — ${outcome.summary} tx=${sig}`);
    } catch (e: any) {
      this.lastError = `${id}: ${e?.message ?? e}`;
      console.error(`[keeper] failed on ${id}:`, e?.message ?? e, e?.logs ?? "");
      const prev = this.deferrals.get(id);
      const attempts = (prev?.attempts ?? 0) + 1;
      this.deferrals.set(id, {
        attempts,
        nextAt: Date.now() + Math.min(60_000 * 2 ** attempts, 3600_000),
        lastReason: String(e?.message ?? e),
      });
    } finally {
      this.inFlight.delete(id);
    }
  }
}
