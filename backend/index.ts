import { oracleKeypair, program } from "./src/chain";
import { config } from "./src/config";
import { Keeper } from "./src/keeper";
import { createServer } from "./src/server";

async function main() {
  let keeper: Keeper | null = null;
  if (config.keeperEnabled && oracleKeypair) {
    keeper = new Keeper(program, oracleKeypair);
    try {
      await keeper.start();
    } catch (e: any) {
      console.error(`[keeper] not started: ${e?.message ?? e}`);
      keeper = null;
    }
  } else {
    console.warn("[keeper] disabled — set ORACLE_KEYPAIR to settle claims. API is read-only.");
  }

  const server = createServer(keeper).listen(config.port, () => {
    console.log(`Insure backend on :${config.port} (program ${program.programId.toBase58()}, ${config.rpcUrl})`);
  });

  const shutdown = async () => {
    await keeper?.stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// A stray rejection must never take down the keeper; log it and keep settling.
process.on("unhandledRejection", (e) => console.error("[process] unhandled rejection:", e));
process.on("uncaughtException", (e) => console.error("[process] uncaught exception:", e));

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
