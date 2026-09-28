/**
 * Solana Actions (Blinks): buy a policy straight from a shared link.
 * Spec: https://solana.com/docs/advanced/actions
 */
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, SYSVAR_CLOCK_PUBKEY, SystemProgram, Transaction } from "@solana/web3.js";
import { Router, type Request, type Response } from "express";
import { connection, program, seeds } from "./chain";
import { config } from "./config";

// CAIP-2 ids of the Solana clusters, used in the X-Blockchain-Ids header.
const CHAIN_IDS: Record<string, string> = {
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  mainnet: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};

const DAY = 86_400;

function actionHeaders(res: Response) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding",
    "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
    "X-Action-Version": "2.4",
    "X-Blockchain-Ids": CHAIN_IDS[config.cluster] ?? CHAIN_IDS.devnet,
  });
}

const usd = (n: BN) => `$${(n.toNumber() / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

async function clusterTime(): Promise<number> {
  try {
    // unix_timestamp in the Clock sysvar is exactly what the program compares against.
    const acc = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, "confirmed");
    if (acc && acc.data.length >= 40) return Number(acc.data.readBigInt64LE(32));
  } catch {
    /* fall back to wall clock */
  }
  return Math.floor(Date.now() / 1000);
}

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

export interface SubscribeParams {
  lat?: string;
  lon?: string;
  flight?: string;
  date?: string;
}

type Risk =
  | { weather: { latitudeE6: number; longitudeE6: number } }
  | { flightDelay: { flightNumber: string; flightDate: BN } };

/** Validates user input the same way the program will, with readable errors. */
export function parseRisk(vault: { triggerType: object; region: any; coverageStart: BN; coverageEnd: BN }, q: SubscribeParams): Risk {
  if ("weather" in vault.triggerType) {
    const lat = Number(q.lat), lon = Number(q.lon);
    if (q.lat === undefined || q.lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("Enter your farm's latitude and longitude.");
    }
    const latE6 = Math.round(lat * 1e6), lonE6 = Math.round(lon * 1e6);
    const r = vault.region;
    if (latE6 < r.minLatE6 || latE6 > r.maxLatE6 || lonE6 < r.minLonE6 || lonE6 > r.maxLonE6) {
      throw new Error(
        `That location is outside this vault's region (lat ${r.minLatE6 / 1e6}…${r.maxLatE6 / 1e6}, lon ${r.minLonE6 / 1e6}…${r.maxLonE6 / 1e6}).`
      );
    }
    return { weather: { latitudeE6: latE6, longitudeE6: lonE6 } };
  }
  const flight = String(q.flight ?? "").toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z0-9]{3,8}$/.test(flight)) throw new Error("Flight number must be 3–8 letters/digits, e.g. AI101.");
  const date = Math.floor(Date.parse(`${q.date}T00:00:00Z`) / 1000);
  if (!Number.isFinite(date) || date < vault.coverageStart.toNumber() || date > vault.coverageEnd.toNumber()) {
    throw new Error("Flight date must be inside the vault's coverage window.");
  }
  return { flightDelay: { flightNumber: flight, flightDate: new BN(date) } };
}

export function actionsRouter(): Router {
  const r = Router();

  r.options(/.*/, (_req, res) => {
    actionHeaders(res);
    res.sendStatus(204);
  });

  // Lets Blink clients map this server's own URLs to actions.
  r.get("/actions.json", (_req, res) => {
    actionHeaders(res);
    res.json({ rules: [{ pathPattern: "/api/actions/**", apiPath: "/api/actions/**" }] });
  });

  r.get("/api/actions/vaults/:vault", async (req: Request, res: Response) => {
    actionHeaders(res);
    let key: PublicKey;
    try {
      key = new PublicKey(String(req.params.vault));
    } catch {
      return fail(res, 400, "Invalid vault address");
    }
    const vault = await program.account.vault.fetchNullable(key);
    if (!vault) return fail(res, 404, "Vault not found");

    // The program checks windows against the cluster clock, not ours.
    const now = await clusterTime();
    const isWeather = "weather" in vault.triggerType;
    const threshold = vault.triggerThreshold.toNumber();
    const free = vault.totalLiquidity.sub(vault.activePolicies.mul(vault.coverageAmount));
    const closedReason = vault.isClosed
      ? "This vault is closed."
      : vault.isPaused
        ? "New policies are paused."
        : now < vault.subscriptionStart.toNumber()
          ? `Opens ${new Date(vault.subscriptionStart.toNumber() * 1000).toUTCString()}.`
          : now > vault.subscriptionEnd.toNumber()
            ? "Subscriptions have closed."
            : free.lt(vault.coverageAmount)
              ? "Fully booked."
              : null;

    const base = `/api/actions/vaults/${key.toBase58()}`;
    const params = isWeather
      ? [
          { name: "lat", label: "Farm latitude (e.g. 20.70)", type: "number", required: true },
          { name: "lon", label: "Farm longitude (e.g. 77.00)", type: "number", required: true },
        ]
      : [
          { name: "flight", label: "Flight number (e.g. AI101)", type: "text", required: true },
          {
            name: "date",
            label: "Departure date (UTC)",
            type: "date",
            required: true,
            min: new Date(vault.coverageStart.toNumber() * 1000).toISOString().slice(0, 10),
            max: new Date(vault.coverageEnd.toNumber() * 1000).toISOString().slice(0, 10),
          },
        ];

    res.json({
      type: "action",
      icon: `${config.siteUrl}/logo.png`,
      title: isWeather ? `Drought cover · ${usd(vault.coverageAmount)} payout` : `Flight delay cover · ${usd(vault.coverageAmount)} payout`,
      description: isWeather
        ? `Pays ${usd(vault.coverageAmount)} automatically if rainfall at your farm over ${vault.observationDays} days is below ${threshold} mm. ${usd(vault.premiumAmount)} per month. Data: Open-Meteo.`
        : `Pays ${usd(vault.coverageAmount)} automatically if your flight is cancelled, diverted or ${threshold}+ min late. One-off ${usd(vault.premiumAmount)}.`,
      label: `Buy for ${usd(vault.premiumAmount)}`,
      ...(closedReason ? { disabled: true, error: { message: closedReason } } : {}),
      links: {
        actions: [
          {
            type: "transaction",
            label: `Buy for ${usd(vault.premiumAmount)}`,
            href: isWeather ? `${base}?lat={lat}&lon={lon}` : `${base}?flight={flight}&date={date}`,
            parameters: params,
          },
        ],
      },
    });
  });

  r.post("/api/actions/vaults/:vault", async (req: Request, res: Response) => {
    actionHeaders(res);
    let key: PublicKey, owner: PublicKey;
    try {
      key = new PublicKey(String(req.params.vault));
      owner = new PublicKey(String(req.body?.account));
    } catch {
      return fail(res, 400, "Invalid vault or account");
    }
    const vault = await program.account.vault.fetchNullable(key);
    if (!vault) return fail(res, 404, "Vault not found");

    let risk: Risk;
    try {
      risk = parseRisk(vault, req.query as SubscribeParams);
    } catch (e: any) {
      return fail(res, 400, e.message);
    }

    const policy = seeds.policy(key, owner);
    if (await connection.getAccountInfo(policy)) return fail(res, 400, "You already have a policy in this vault.");
    const ownerUsdc = getAssociatedTokenAddressSync(vault.usdcMint, owner, true);
    const bal = await connection.getTokenAccountBalance(ownerUsdc).catch(() => null);
    if (!bal || new BN(bal.value.amount).lt(vault.premiumAmount)) {
      return fail(res, 400, `You need at least ${usd(vault.premiumAmount)} USDC. Get devnet USDC at faucet.circle.com.`);
    }

    const ix = await program.methods
      .subscribe(risk)
      .accountsStrict({
        owner,
        vault: key,
        policy,
        ownerUsdc,
        vaultTreasury: seeds.treasury(key),
        usdcMint: vault.usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(ix);

    const until = "weather" in vault.triggerType
      ? Math.min(vault.coverageStart.toNumber() + 30 * DAY, vault.coverageEnd.toNumber())
      : vault.coverageEnd.toNumber();
    res.json({
      type: "transaction",
      transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      message: `Covered until ${new Date(until * 1000).toDateString()}. File claims at ${config.siteUrl}/vaults/${key.toBase58()}`,
    });
  });

  return r;
}
