import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import IDL from "../types/insure.json";
import type { Insure } from "../types/insure";
import { config, loadKeypair } from "./config";

export const PROGRAM_ID = new PublicKey(IDL.address);

export const connection = new Connection(config.rpcUrl, {
  commitment: "confirmed",
  wsEndpoint: config.wsUrl,
});

/** The oracle key signs settlements. Without one the server runs read-only. */
export const oracleKeypair: Keypair | null = config.oracleKeypair ? loadKeypair(config.oracleKeypair) : null;

// Read-only calls still need a wallet object; a throwaway key is fine for those.
const wallet = new Wallet(oracleKeypair ?? Keypair.generate());
export const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
export const program = new Program<Insure>(IDL as Insure, provider);

export const seeds = {
  config: () => PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0],
  treasury: (vault: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("treasury"), vault.toBuffer()], PROGRAM_ID)[0],
  policy: (vault: PublicKey, owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("policy"), vault.toBuffer(), owner.toBuffer()], PROGRAM_ID)[0],
};
