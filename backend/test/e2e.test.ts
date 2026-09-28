/**
 * Full lifecycle against the real compiled program in LiteSVM, driven by the
 * same TypeScript the keeper uses: IDL encoding, account lists, oracle rule,
 * evidence hashing and settlement.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import {
  ACCOUNT_SIZE,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createInitializeAccount3Instruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { address, getTransactionDecoder } from "@solana/kit";
import { Clock, FailedTransactionMetadata, LiteSVM } from "litesvm";
import IDL from "../types/insure.json";
import type { Insure } from "../types/insure";
import { config } from "../src/config";
import { buildEvidence, buildSettleIx, claimContext } from "../src/keeper";
import { evaluateClaim } from "../src/oracle/evaluate";
import { ACCOUNT_SIZE as PROGRAM_ACCOUNT_SIZE } from "../src/raw";

const DAY = 86_400;
const USDC = 1_000_000;
const SO = path.resolve(__dirname, "../../insure/target/deploy/insure.so");
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
// These tests execute the compiled program; skip (don't crash) on a fresh checkout.
const NEEDS_PROGRAM = { skip: fs.existsSync(SO) ? false : "program not built — run `anchor build` in insure/" };

const program = new Program<Insure>(
  IDL as Insure,
  new AnchorProvider(new Connection("http://127.0.0.1:1"), new Wallet(Keypair.generate()), {})
);
const pid = program.programId;
const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, pid)[0];

class Chain {
  svm = new LiteSVM();
  admin = Keypair.generate();
  oracle = Keypair.generate();
  creator = Keypair.generate();
  mint = Keypair.generate();

  constructor() {
    this.svm.addProgramFromFile(address(pid.toBase58()), SO);
    // make `admin` the upgrade authority (litesvm deploys with none)
    const pd = PublicKey.findProgramAddressSync([pid.toBuffer()], LOADER)[0];
    const acc = this.svm.getAccount(address(pd.toBase58()));
    assert(acc.exists);
    const data = new Uint8Array(acc.data);
    data[12] = 1;
    data.set(this.admin.publicKey.toBytes(), 13);
    this.svm.setAccount({ ...acc, data });
    for (const kp of [this.admin, this.oracle, this.creator]) this.airdrop(kp.publicKey);
  }

  airdrop(pk: PublicKey) {
    this.svm.airdrop(address(pk.toBase58()), BigInt(100e9) as any);
  }

  send(ixs: TransactionInstruction[], signers: Keypair[]) {
    this.svm.expireBlockhash();
    const tx = new Transaction({ feePayer: signers[0].publicKey, recentBlockhash: this.svm.latestBlockhash() }).add(...ixs);
    tx.sign(...signers);
    const res = this.svm.sendTransaction(getTransactionDecoder().decode(tx.serialize()));
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(`tx failed: ${res.toString()}\n${res.meta().logs().join("\n")}`);
    }
  }

  now(): number {
    return Number(this.svm.getClock().unixTimestamp);
  }

  warp(ts: number) {
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot + 1n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(ts)));
  }

  fetch<K extends "claim" | "vault" | "policyHolder">(kind: K, key: PublicKey) {
    const acc = this.svm.getAccount(address(key.toBase58()));
    assert(acc.exists, `${kind} ${key.toBase58()} missing`);
    return program.coder.accounts.decode(kind, Buffer.from(acc.data));
  }

  balance(tokenAccount: PublicKey): bigint {
    const acc = this.svm.getAccount(address(tokenAccount.toBase58()));
    return acc.exists ? AccountLayout.decode(Buffer.from(acc.data)).amount : 0n;
  }

  tokenAccount(owner: PublicKey, amount: number): PublicKey {
    const kp = Keypair.generate();
    this.send(
      [
        SystemProgram.createAccount({
          fromPubkey: this.admin.publicKey,
          newAccountPubkey: kp.publicKey,
          lamports: 1e8,
          space: ACCOUNT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeAccount3Instruction(kp.publicKey, this.mint.publicKey, owner),
        ...(amount ? [createMintToInstruction(this.mint.publicKey, kp.publicKey, this.admin.publicKey, amount)] : []),
      ],
      [this.admin, kp]
    );
    return kp.publicKey;
  }

  async setup() {
    this.send(
      [
        SystemProgram.createAccount({
          fromPubkey: this.admin.publicKey,
          newAccountPubkey: this.mint.publicKey,
          lamports: 1e8,
          space: MINT_SIZE,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMint2Instruction(this.mint.publicKey, 6, this.admin.publicKey, null),
      ],
      [this.admin, this.mint]
    );
    const ix = await program.methods
      .initializeConfig(this.oracle.publicKey)
      .accountsStrict({
        authority: this.admin.publicKey,
        config: pda(Buffer.from("config")),
        usdcMint: this.mint.publicKey,
        program: pid,
        programData: PublicKey.findProgramAddressSync([pid.toBuffer()], LOADER)[0],
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    this.send([ix], [this.admin]);
  }

  async createVault(kind: "weather" | "flight", t0: number): Promise<PublicKey> {
    const vault = pda(Buffer.from("vault"), this.creator.publicKey.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8));
    const treasury = pda(Buffer.from("treasury"), vault.toBuffer());
    const creatorUsdc = this.tokenAccount(this.creator.publicKey, 1_000 * USDC);
    const init = await program.methods
      .initializeVault(
        new BN(0),
        kind === "weather" ? { weather: {} } : { flightDelay: {} },
        new BN(kind === "weather" ? 50 : 120),
        kind === "weather" ? 30 : 0,
        kind === "weather"
          ? { minLatE6: 18_000_000, maxLatE6: 23_000_000, minLonE6: 74_000_000, maxLonE6: 80_000_000 }
          : { minLatE6: 0, maxLatE6: 0, minLonE6: 0, maxLonE6: 0 },
        new BN(5 * USDC),
        new BN(100 * USDC),
        new BN(t0 + 60),
        new BN(t0 + DAY),
        new BN(t0 + DAY),
        new BN(t0 + 61 * DAY),
        new BN(t0 + 70 * DAY),
        500
      )
      .accountsStrict({
        authority: this.creator.publicKey,
        config: pda(Buffer.from("config")),
        usdcMint: this.mint.publicKey,
        vault,
        vaultTreasury: treasury,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const deposit = await program.methods
      .depositLiquidity(new BN(500 * USDC))
      .accountsStrict({
        creator: this.creator.publicKey,
        vault,
        vaultTreasury: treasury,
        creatorUsdc,
        usdcMint: this.mint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    this.send([init, deposit], [this.creator]);
    return vault;
  }

  async buyAndClaim(vault: PublicKey, risk: any, subscribeAt: number, claimAt: number) {
    const user = Keypair.generate();
    this.airdrop(user.publicKey);
    const userUsdc = this.tokenAccount(user.publicKey, 50 * USDC);
    const policy = pda(Buffer.from("policy"), vault.toBuffer(), user.publicKey.toBuffer());
    const treasury = pda(Buffer.from("treasury"), vault.toBuffer());
    this.warp(subscribeAt);
    const sub = await program.methods
      .subscribe(risk)
      .accountsStrict({
        owner: user.publicKey,
        vault,
        policy,
        ownerUsdc: userUsdc,
        vaultTreasury: treasury,
        usdcMint: this.mint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    this.send([sub], [user]);

    this.warp(claimAt);
    const claim = pda(Buffer.from("claim"), vault.toBuffer(), user.publicKey.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8));
    const raise = await program.methods
      .raiseClaim()
      .accountsStrict({
        claimant: user.publicKey,
        vault,
        policy,
        claim,
        claimantUsdc: userUsdc,
        vaultTreasury: treasury,
        usdcMint: this.mint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    this.send([raise], [user]);
    return { user, claim };
  }

  /** Exactly what Keeper.processClaim does, minus RPC. */
  async runOracle(claimKey: PublicKey, fakeFetch: typeof fetch) {
    const claim = this.fetch("claim", claimKey);
    const vault = this.fetch("vault", claim.vault);
    const policy = this.fetch("policyHolder", claim.policy);
    const ctx = claimContext(claimKey, claim, vault, policy);
    const outcome = await evaluateClaim(ctx, fakeFetch);
    assert.notEqual(outcome.decision, "defer", JSON.stringify(outcome));
    if (outcome.decision === "defer") throw new Error("unreachable");
    const { hash } = await buildEvidence(ctx, outcome, this.oracle.publicKey);
    const ix = await buildSettleIx(program, this.oracle.publicKey, claimKey, claim, vault.usdcMint, outcome.decision === "approve", outcome.observedValue, hash);
    this.send([ix], [this.oracle]);
    return { ctx, outcome, hash };
  }
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

test("weather: drought → oracle approves → claimant paid; evidence hash on-chain", NEEDS_PROGRAM, async () => {
  const chain = new Chain();
  await chain.setup();
  const t0 = chain.now();
  const vault = await chain.createVault("weather", t0);
  const risk = { weather: { latitudeE6: 20_700_000, longitudeE6: 77_000_000 } };
  const { user, claim } = await chain.buyAndClaim(vault, risk, t0 + 120, t0 + DAY + 30 * DAY + 3600);

  let requested = "";
  const dryFetch = (async (url: string) => {
    requested = url;
    const days = Array.from({ length: 30 }, (_, i) => `d${i}`);
    return json({ daily: { time: days, precipitation_sum: days.map(() => 0.5) } });
  }) as typeof fetch;

  const sizeOf = (k: PublicKey) => {
    const a = chain.svm.getAccount(address(k.toBase58()));
    return a.exists ? a.data.length : -1;
  };
  const c0 = chain.fetch("claim", claim);
  assert.equal(sizeOf(claim), PROGRAM_ACCOUNT_SIZE.claim, "claim size must match the off-chain filter");
  assert.equal(sizeOf(c0.policy), PROGRAM_ACCOUNT_SIZE.policyHolder, "policy size must match the off-chain filter");
  assert.equal(sizeOf(vault), PROGRAM_ACCOUNT_SIZE.vault, "vault size must match the off-chain filter");

  const { outcome, hash } = await chain.runOracle(claim, dryFetch);
  assert.match(requested, /latitude=20\.700000&longitude=77\.000000/);
  assert.equal(outcome.decision, "approve");

  const c = chain.fetch("claim", claim);
  assert.ok("approved" in c.status);
  assert.equal(c.observedValue.toNumber(), 150); // 15.0 mm
  assert.deepEqual(Buffer.from(c.evidenceHash), hash);
  assert.equal(chain.balance(getAssociatedTokenAddressSync(chain.mint.publicKey, user.publicKey)), BigInt(100 * USDC));

  const v = chain.fetch("vault", vault);
  assert.equal(v.totalLiquidity.toNumber(), 400 * USDC);
  assert.equal(v.pendingClaims.toNumber(), 0);
});

test("weather: monsoon → oracle rejects, no payout", NEEDS_PROGRAM, async () => {
  const chain = new Chain();
  await chain.setup();
  const t0 = chain.now();
  const vault = await chain.createVault("weather", t0);
  const { user, claim } = await chain.buyAndClaim(
    vault,
    { weather: { latitudeE6: 20_700_000, longitudeE6: 77_000_000 } },
    t0 + 120,
    t0 + DAY + 30 * DAY + 3600
  );
  const wetFetch = (async () => {
    const days = Array.from({ length: 30 }, (_, i) => `d${i}`);
    return json({ daily: { time: days, precipitation_sum: days.map(() => 10) } });
  }) as typeof fetch;
  await chain.runOracle(claim, wetFetch);
  assert.ok("rejected" in chain.fetch("claim", claim).status);
  assert.equal(chain.balance(getAssociatedTokenAddressSync(chain.mint.publicKey, user.publicKey)), 0n);
});

test("flight: cancelled flight → oracle approves via aviationstack data", NEEDS_PROGRAM, async () => {
  config.aviationstackApiKey = "test-key";
  config.aerodataboxApiKey = "";
  const chain = new Chain();
  await chain.setup();
  const t0 = chain.now();
  const vault = await chain.createVault("flight", t0);
  const flightDate = Math.floor((t0 + 10 * DAY) / DAY) * DAY;
  const dateStr = new Date(flightDate * 1000).toISOString().slice(0, 10);
  const { claim } = await chain.buyAndClaim(
    vault,
    { flightDelay: { flightNumber: "AI101", flightDate: new BN(flightDate) } },
    t0 + 120,
    flightDate + DAY
  );
  const fakeFetch = (async (url: string) => {
    assert.match(url, /flight_iata=AI101/);
    return json({
      data: [{ flight_date: dateStr, flight_status: "cancelled", flight: { iata: "AI101" }, departure: {}, arrival: {} }],
    });
  }) as typeof fetch;
  const { outcome } = await chain.runOracle(claim, fakeFetch);
  assert.equal(outcome.decision, "approve");
  const c = chain.fetch("claim", claim);
  assert.ok("approved" in c.status);
  assert.equal(c.observedValue.toNumber(), -1);
});
