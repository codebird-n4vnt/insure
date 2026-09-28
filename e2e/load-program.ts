import fs from "fs";
import os from "os";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const RPC = "http://127.0.0.1:8899";
// Same ID the backend and frontend use (updated by scripts/sync-idl.sh after `anchor keys sync`).
const PROGRAM = new PublicKey(JSON.parse(fs.readFileSync(require("path").join(__dirname, "../backend/types/insure.json"), "utf8")).address);
const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.AUTHORITY || os.homedir() + "/.config/solana/id.json", "utf8"))));
const so = fs.readFileSync(require("path").join(__dirname, "../insure/target/deploy/insure.so"));

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j: any = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

(async () => {
  const [programData] = PublicKey.findProgramAddressSync([PROGRAM.toBuffer()], LOADER);
  const header = Buffer.alloc(45);
  header.writeUInt32LE(3, 0); // ProgramData
  header.writeBigUInt64LE(0n, 4); // slot
  header[12] = 1; // Some(authority)
  authority.publicKey.toBuffer().copy(header, 13);
  const pd = Buffer.concat([header, so]);
  const prog = Buffer.alloc(36);
  prog.writeUInt32LE(2, 0); // Program
  programData.toBuffer().copy(prog, 4);

  const conn = new Connection(RPC, "confirmed");
  const rent = async (n: number) => conn.getMinimumBalanceForRentExemption(n);
  await rpc("surfnet_setAccount", [programData.toBase58(), { lamports: await rent(pd.length), data: pd.toString("hex"), owner: LOADER.toBase58(), executable: false }]);
  await rpc("surfnet_setAccount", [PROGRAM.toBase58(), { lamports: await rent(36), data: prog.toString("hex"), owner: LOADER.toBase58(), executable: true }]);
  const info = await conn.getAccountInfo(PROGRAM);
  console.log("program executable:", info?.executable, "owner:", info?.owner.toBase58(), "programdata bytes:", (await conn.getAccountInfo(programData))?.data.length);
})().catch((e) => { console.error(e); process.exit(1); });
