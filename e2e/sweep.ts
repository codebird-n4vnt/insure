import fs from "fs";
import os from "os";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import IDL from "../backend/types/insure.json";
import type { Insure } from "../backend/types/insure";

const E2E = process.env.E2E!;
const conn = new Connection("http://127.0.0.1:8899", "confirmed");
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.AUTHORITY || os.homedir() + "/.config/solana/id.json", "utf8"))));
const mint = new PublicKey(fs.readFileSync(`${E2E}/mint.txt`, "utf8").trim());
const rpc = async (method: string, params: unknown[]) => (await (await fetch("http://127.0.0.1:8899", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json()).result;
const chainNow = async () => (await conn.getBlockTime(await conn.getSlot()))!;
const travel = async (ts: number) => { await rpc("surfnet_timeTravel", [{ absoluteTimestamp: ts * 1000 }]); await new Promise((r) => setTimeout(r, 1500)); };

async function actor() {
  const kp = Keypair.generate();
  await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL));
  const ata = await getOrCreateAssociatedTokenAccount(conn, admin, mint, kp.publicKey);
  await mintTo(conn, admin, mint, ata.address, admin, 1_000_000_000n);
  return { kp, ata: ata.address, program: new Program<Insure>(IDL as Insure, new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" })) };
}

(async () => {
  const pid = new PublicKey(IDL.address);
  const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, pid)[0];
  const creator = await actor(), farmer = await actor();
  const t = await chainNow();
  const vault = pda(Buffer.from("vault"), creator.kp.publicKey.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8));
  const treasury = pda(Buffer.from("treasury"), vault.toBuffer());
  await creator.program.methods
    .initializeVault(new BN(0), { weather: {} }, new BN(50), 1, { minLatE6: 20_000_000, maxLatE6: 22_000_000, minLonE6: 78_000_000, maxLonE6: 80_000_000 },
      new BN(5e6), new BN(100e6), new BN(t + 10), new BN(t + 60), new BN(t + 60), new BN(t + 40 * 86400), new BN(t + 50 * 86400), 500)
    .accountsStrict({ authority: creator.kp.publicKey, config: pda(Buffer.from("config")), usdcMint: mint, vault, vaultTreasury: treasury, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
    .postInstructions([await creator.program.methods.depositLiquidity(new BN(300e6)).accountsStrict({ creator: creator.kp.publicKey, vault, vaultTreasury: treasury, creatorUsdc: creator.ata, usdcMint: mint, tokenProgram: TOKEN_PROGRAM_ID }).instruction()])
    .rpc();
  await travel(t + 20);
  const policy = pda(Buffer.from("policy"), vault.toBuffer(), farmer.kp.publicKey.toBuffer());
  await farmer.program.methods.subscribe({ weather: { latitudeE6: 21_150_000, longitudeE6: 79_080_000 } })
    .accountsStrict({ owner: farmer.kp.publicKey, vault, policy, ownerUsdc: farmer.ata, vaultTreasury: treasury, usdcMint: mint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
  await travel(t + 60 + 86400 + 120);
  const claim = pda(Buffer.from("claim"), vault.toBuffer(), farmer.kp.publicKey.toBuffer(), new BN(0).toArrayLike(Buffer, "le", 8));
  await farmer.program.methods.raiseClaim()
    .accountsStrict({ claimant: farmer.kp.publicKey, vault, policy, claim, claimantUsdc: farmer.ata, vaultTreasury: treasury, usdcMint: mint, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).rpc();
  fs.writeFileSync(`${E2E}/sweep-claim.txt`, claim.toBase58());
  console.log("claim filed while keeper offline:", claim.toBase58());
})().catch((e) => { console.error(e); process.exit(1); });
