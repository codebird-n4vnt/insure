import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "../config";

/** Deterministic JSON: sorted keys, no whitespace. Anyone can re-hash a bundle and compare to chain. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256(data: string): Buffer {
  return crypto.createHash("sha256").update(data, "utf8").digest();
}

export function hashEvidence(bundle: unknown): { canonical: string; hash: Buffer } {
  const canonical = canonicalJson(bundle);
  return { canonical, hash: sha256(canonical) };
}

const isSafeKey = (key: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(key);

export function saveEvidence(claim: string, canonical: string): void {
  if (!isSafeKey(claim)) throw new Error("bad claim key");
  fs.mkdirSync(config.evidenceDir, { recursive: true });
  const file = path.join(config.evidenceDir, `${claim}.json`);
  fs.writeFileSync(`${file}.tmp`, canonical);
  fs.renameSync(`${file}.tmp`, file);
}

export function loadEvidence(claim: string): string | null {
  if (!isSafeKey(claim)) return null;
  const file = path.join(config.evidenceDir, `${claim}.json`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}
