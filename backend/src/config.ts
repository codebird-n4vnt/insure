import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

/**
 * Accepts a base58 secret key, a JSON byte array, or a path to a Solana CLI keypair file.
 */
export function loadKeypair(value: string): Keypair {
  const v = value.trim();
  if (v.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(v)));
  const expanded = v.startsWith("~") ? path.join(os.homedir(), v.slice(1)) : v;
  if (fs.existsSync(expanded)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(expanded, "utf8"))));
  }
  return Keypair.fromSecretKey(bs58.decode(v));
}

export const config = {
  port: num("PORT", 3001),
  rpcUrl: process.env.RPC_URL || "https://api.devnet.solana.com",
  wsUrl: process.env.WS_URL || undefined,
  cluster: process.env.CLUSTER || "devnet",
  /** Public URL of the frontend (Blink icons and links). */
  siteUrl: (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  /** Comma-separated list of allowed browser origins; empty = allow all (read-only API). */
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  keeperEnabled: bool("KEEPER_ENABLED", true),
  oracleKeypair: process.env.ORACLE_KEYPAIR || "",
  pollIntervalSeconds: num("POLL_INTERVAL_SECONDS", 60),
  /** A claim that still has no usable data this long after filing is rejected (claimant can re-file). */
  dataDeadlineHours: num("DATA_DEADLINE_HOURS", 72),
  evidenceDir: path.resolve(process.env.EVIDENCE_DIR || "./data/evidence"),

  geminiApiKey: process.env.GEMINI_API_KEY || "",
  /** Tried in order; lets you survive a model being retired or rate-limited. */
  geminiModels: (process.env.GEMINI_MODELS || "gemini-2.5-flash,gemini-2.5-flash-lite")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  geminiTimeoutMs: num("GEMINI_TIMEOUT_MS", 30_000),

  aviationstackApiKey: process.env.AVIATIONSTACK_API_KEY || "",
  // The Aviationstack free plan only serves plain HTTP.
  aviationstackBaseUrl: process.env.AVIATIONSTACK_BASE_URL || "http://api.aviationstack.com/v1",
  aerodataboxApiKey: process.env.AERODATABOX_API_KEY || "",
};

export type AppConfig = typeof config;
