import fs from "fs";
import os from "os";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const E2E = process.env.E2E!;
const conn = new Connection("http://127.0.0.1:8899", "confirmed");
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.AUTHORITY || os.homedir() + "/.config/solana/id.json", "utf8"))));

(async () => {
  const [cmd, arg, amount] = process.argv.slice(2);
  if (cmd === "init") {
    const oracle = Keypair.generate();
    fs.writeFileSync(`${E2E}/oracle.json`, JSON.stringify(Array.from(oracle.secretKey)));
    await conn.confirmTransaction(await conn.requestAirdrop(oracle.publicKey, 10 * LAMPORTS_PER_SOL));
    const mint = await createMint(conn, admin, admin.publicKey, null, 6);
    fs.writeFileSync(`${E2E}/mint.txt`, mint.toBase58());
    console.log(JSON.stringify({ oracle: oracle.publicKey.toBase58(), mint: mint.toBase58() }));
  } else if (cmd === "warp") {
    // warp <days> — fast-forward the local chain clock (surfpool only)
    const days = Number(arg);
    if (!Number.isFinite(days) || days <= 0) throw new Error("usage: warp <days>");
    const clock = await conn.getAccountInfo(new PublicKey("SysvarC1ock11111111111111111111111111111111"));
    const now = Number(clock!.data.readBigInt64LE(32));
    const target = now + Math.round(days * 86400);
    const res = await fetch("http://127.0.0.1:8899", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "surfnet_timeTravel", params: [{ absoluteTimestamp: target * 1000 }] }),
    });
    const body: any = await res.json();
    if (body.error) throw new Error(JSON.stringify(body.error));
    console.log(`chain clock: ${new Date(now * 1000).toISOString()} → ${new Date(target * 1000).toISOString()}`);
  } else if (cmd === "fund") {
    // fund <address> <usdc>  — SOL + local USDC for a browser wallet
    const who = new PublicKey(arg);
    const mint = new PublicKey(fs.readFileSync(`${E2E}/mint.txt`, "utf8").trim());
    await conn.confirmTransaction(await conn.requestAirdrop(who, 5 * LAMPORTS_PER_SOL));
    const ata = await getOrCreateAssociatedTokenAccount(conn, admin, mint, who);
    await mintTo(conn, admin, mint, ata.address, admin, BigInt(Math.round(Number(amount) * 1e6)));
    console.log(`funded ${who.toBase58()} with ${amount} USDC`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
