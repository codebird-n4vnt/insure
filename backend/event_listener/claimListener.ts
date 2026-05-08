import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { resolveClaimOracle } from "../switchboard-function/resolveClaimOracle.ts/main";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
// import type {Insure} from "../../insure/target/types/insure"
const USDC_MINT = process.env.USDC_MINT_ADDRESS;
export async function ClaimListener(program : Program, keypair: Keypair, connection: Connection) {

    const id = await program.addEventListener("ClaimFiled", async (event,slot)=>{
        console.log("New claim filed: ", event.claimant.toBase58(), "slot :", slot);

        const claimAccount = await program.account.claim.fetch(event.claim);
        const vaultAccount = await program.account.vault.fetch(event.vault);
        
        let claimData;

        if("Weather" in claimAccount.claimData){
            claimData = {
                triggerType : "Weather" as const,
                lat: claimAccount.claimData.weather.latitude / 10_000,
                lng: claimAccount.claimData.weather.longitude / 10_000,
            };
        } else {
            const flightBytes = claimAccount.claimData.flightDelay.flightNumber;
            const flightNumber = Buffer.from(flightBytes).toString("ascii").replace(/\0/g, "");

            claimData = {
                triggerType: "FlightDelay" as const,
                flightNumber,
                flightDate: new Date(
                    claimAccount.claimData.flightDelay.flightDate * 1000
                ).toISOString().split("T")[0],
            };
        }

        try {
            const result = await resolveClaimOracle(
                program,
                keypair,
                connection,
                event.claim,
                event.vault,
                event.claimant,
                new PublicKey(USDC_MINT!),
                vaultAccount.triggerThreshold.toNumber(),
                claimData
            );

            console.log("Claim resolved:", result.verdict ? 'APPROVED':'REJECTED');
            console.log("Reason:", result.reason);
        } catch (error) {
            console.error("Oracle failed:", err);
        }
    });
}