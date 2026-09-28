/**
 * One-time protocol setup. Must be signed by the program's upgrade authority.
 *
 *   npm run init-config -- --oracle <ORACLE_PUBKEY> [--mint <USDC_MINT>] [--authority ~/.config/solana/id.json]
 *
 * If --oracle is omitted, the public key of ORACLE_KEYPAIR from .env is used.
 * Re-running with an existing config rotates the oracle instead (admin only).
 */
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import IDL from "../types/insure.json";
import type { Insure } from "../types/insure";
import { connection, seeds } from "../src/chain";
import { config, loadKeypair } from "../src/config";

const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const authority = loadKeypair(arg("authority") ?? "~/.config/solana/id.json");
  const oracle = arg("oracle")
    ? new PublicKey(arg("oracle")!)
    : config.oracleKeypair
      ? loadKeypair(config.oracleKeypair).publicKey
      : null;
  if (!oracle) throw new Error("Pass --oracle <pubkey> or set ORACLE_KEYPAIR in .env");
  const mint = new PublicKey(arg("mint") ?? process.env.USDC_MINT ?? DEVNET_USDC);

  const provider = new AnchorProvider(connection, new Wallet(authority), { commitment: "confirmed" });
  const program = new Program<Insure>(IDL as Insure, provider);
  const configPda = seeds.config();

  const existing = await program.account.config.fetchNullable(configPda);
  if (existing) {
    console.log("Config exists:", {
      admin: existing.admin.toBase58(),
      oracle: existing.oracleAuthority.toBase58(),
      usdcMint: existing.usdcMint.toBase58(),
    });
    if (existing.oracleAuthority.equals(oracle)) return console.log("Oracle already set. Nothing to do.");
    const sig = await program.methods
      .updateConfig(existing.admin, oracle)
      .accountsStrict({ admin: authority.publicKey, config: configPda })
      .rpc();
    return console.log(`Oracle rotated to ${oracle.toBase58()} — tx ${sig}`);
  }

  const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_UPGRADEABLE_LOADER);
  const sig = await program.methods
    .initializeConfig(oracle)
    .accountsStrict({
      authority: authority.publicKey,
      config: configPda,
      usdcMint: mint,
      program: program.programId,
      programData,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`Config initialised (oracle ${oracle.toBase58()}, mint ${mint.toBase58()}) — tx ${sig}`);
}

main().catch((e) => {
  console.error(e?.message ?? e, e?.logs ?? "");
  process.exit(1);
});
