import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { PROGRAM_ID } from "./chain";
import { config } from "./config";
import {
  getAllVaults,
  getClaimsForVault,
  getConfig,
  getPoliciesForVault,
  getUserClaims,
  getUserPolicies,
  getUserPolicy,
  getVault,
  parseKey,
} from "./indexer";
import { loadEvidence } from "./oracle/evidence";
import { geminiAvailable } from "./oracle/gemini";
import type { Keeper } from "./keeper";
import { actionsRouter } from "./actions";
import { byField, protocolStats, rawAccounts, recentClaims } from "./raw";

/** Tiny fixed-window limiter; getProgramAccounts is expensive on public RPCs. */
function rateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now > h.reset) {
      hits.set(key, { n: 1, reset: now + windowMs });
      if (hits.size > 10_000) hits.clear();
      return next();
    }
    if (++h.n > limit) return res.status(429).json({ error: "Too many requests" });
    next();
  };
}

function key(res: Response, value: string | string[] | undefined) {
  const k = typeof value === "string" ? parseKey(value) : null;
  if (!k) res.status(400).json({ error: "Invalid public key" });
  return k;
}

export function createServer(keeper: Keeper | null) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "10kb" }));
  app.use(rateLimit(120, 60_000));
  app.use(actionsRouter());
  app.use(
    cors({
      origin: config.allowedOrigins.length ? config.allowedOrigins : true,
      methods: ["GET"],
    })
  );
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/health", async (_req, res) => {
    res.json({
      ok: true,
      programId: PROGRAM_ID.toBase58(),
      cluster: config.cluster,
      gemini: geminiAvailable(),
      flightProviders: {
        aviationstack: !!config.aviationstackApiKey,
        aerodatabox: !!config.aerodataboxApiKey,
      },
      keeper: keeper?.status() ?? { running: false, reason: "ORACLE_KEYPAIR not set or KEEPER_ENABLED=false" },
    });
  });

  app.get("/config", async (_req, res) => res.json(await getConfig()));
  app.get("/vaults", async (_req, res) => res.json(await getAllVaults()));

  app.get("/vaults/:address", async (req, res) => {
    const vault = key(res, req.params.address);
    if (!vault) return;
    const data = await getVault(vault);
    data ? res.json(data) : res.status(404).json({ error: "Vault not found" });
  });
  app.get("/vaults/:address/policies", async (req, res) => {
    const vault = key(res, req.params.address);
    if (vault) res.json(await getPoliciesForVault(vault));
  });
  app.get("/vaults/:address/claims", async (req, res) => {
    const vault = key(res, req.params.address);
    if (vault) res.json(await getClaimsForVault(vault));
  });
  app.get("/policy/:vault/:wallet", async (req, res) => {
    const vault = key(res, req.params.vault);
    if (!vault) return;
    const wallet = key(res, req.params.wallet);
    if (wallet) res.json(await getUserPolicy(vault, wallet));
  });
  app.get("/policies/:wallet", async (req, res) => {
    const wallet = key(res, req.params.wallet);
    if (wallet) res.json(await getUserPolicies(wallet));
  });
  app.get("/claims/:wallet", async (req, res) => {
    const wallet = key(res, req.params.wallet);
    if (wallet) res.json(await getUserClaims(wallet));
  });

  // Raw account data (base64) for clients that decode with the IDL themselves.
  // PolicyHolder/Claim: vault at offset 8, owner/claimant at 40. Vault: authority at 8.
  app.get("/raw/vaults", async (req, res) => {
    const authority = req.query.authority ? key(res, String(req.query.authority)) : undefined;
    if (authority === null) return;
    res.json(await rawAccounts("vault", authority ? [byField(8, authority)] : []));
  });
  app.get("/raw/policies", async (req, res) => {
    if (req.query.vault) {
      const vault = key(res, String(req.query.vault));
      if (vault) res.json(await rawAccounts("policyHolder", [byField(8, vault)]));
      return;
    }
    const owner = key(res, String(req.query.owner ?? ""));
    if (owner) res.json(await rawAccounts("policyHolder", [byField(40, owner)]));
  });
  app.get("/raw/claims", async (req, res) => {
    if (req.query.vault) {
      const vault = key(res, String(req.query.vault));
      if (vault) res.json(await rawAccounts("claim", [byField(8, vault)]));
      return;
    }
    const claimant = key(res, String(req.query.claimant ?? ""));
    if (claimant) res.json(await rawAccounts("claim", [byField(40, claimant)]));
  });
  app.get("/raw/claims/recent", async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 50);
    res.json(await recentClaims(limit));
  });
  app.get("/stats", async (_req, res) => res.json(await protocolStats()));

  /** The exact bytes whose sha256 is stored in Claim.evidence_hash. */
  app.get("/evidence/:claim", (req, res) => {
    const body = loadEvidence(req.params.claim);
    if (!body) return res.status(404).json({ error: "No evidence for this claim (yet)" });
    res.type("application/json").send(body);
  });

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[api]", err?.message ?? err);
    res.status(502).json({ error: "Upstream RPC error" });
  });
  return app;
}
