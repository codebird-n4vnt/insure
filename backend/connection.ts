
import {Connection, Keypair,PublicKey} from "@solana/web3.js";
import {AnchorProvider, Program, Wallet} from "@coral-xyz/anchor";
import {createHelius} from "helius-sdk";
import bs58 from "bs58"
import IDL from "./types/insure.json";
import type {Insure} from "./types/insure";

export const PROGRAM_ID = new PublicKey("8c1CfhXgqjKJct4kgoupTHCWk7TnK3MeLjRSV2KqqCsw");
export const USDC_MINT = new PublicKey(process.env.USDC_MINT_ADDRESS!);
export const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

export const helius = createHelius({apiKey:HELIUS_API_KEY});

export const connection = new Connection(process.env.HELIUS_RPC_URL!, "confirmed");

export const keeperKeypair = Keypair.fromSecretKey(bs58.decode(process.env.KEEPER_KEYPAIR!));

const wallet = new Wallet(keeperKeypair);
const provider = new AnchorProvider(connection,wallet,{commitment:"confirmed",});

export const program = new Program<Insure>(IDL as Insure, provider);

