// import { Program } from "@coral-xyz/anchor";
// import { Insure } from "../insure/target/types/insure";
import { connection, keeperKeypair, program, USDC_MINT } from "./connection";
import { resolveClaimOracle } from "./switchboard-function/resolveClaimOracle/main";



let listenerIds: number[] = [];

function parseClaimData(claimAccount:any){
    if("weather" in claimAccount.claimData){
        return {
            triggerType: "Weather" as const,
            lat: claimAccount.claimData.weather.latitude, // <--- they were divided by 10_000 initially fall back to it in case there is any kind of error
            lng: claimAccount.claimData.weather.longitude,
        };
    } else {
        const flightNumber = Buffer.from(claimAccount.claimData.flightDelay.flightNumber).toString("ascii").replace(/\0/g, "");

        const flightDate = new Date(claimAccount.claimData.flightDelay.flightDate*1000).toISOString().split("T")[0];

        return {
            triggerType: "FlightDelay" as const,
            flightNumber,
            flightDate
        };
    }
}

async function handleClaimFiled(event:any){
    console.log("CLAIMFILED")
    console.log("Claim : ", event.claim.toBase58())
    console.log("Vault : ", event.vault.toBase58())
    console.log("Claimant : ", event.claimant.toBase58())

    try {
        const [claimAccount, vaultAccount] = await Promise.all([
            program.account.claim.fetch(event.claim), // this error is because program.account.claim expects program to be of type Program<Insure> but this conflicts with the resolveClaimOracle which expects program<Idl> 
            program.account.vault.fetch(event.vault)  // so, I will need to look at it how to resolve this issue
        ]);                                           // also one thing that copilot said that IDL in program should be provided with PROGRAM_ID.

        const claimData = parseClaimData(claimAccount);

        const result = await resolveClaimOracle(
            program,
            keeperKeypair,
            connection,
            event.claim,
            event.vault,
            event.claimant,
            USDC_MINT,
            vaultAccount.triggerThreshold.toNumber(),
            claimData
        );

        console.log("Verdict : ", result.verdict ? "Approved" : "Rejected");
        console.log("Txn : ", result.txSignature);
    } catch (error) {
        console.error("Oracle failed for claim: ",  event.claim.toBase58(), error)
    }
}


function registerListeners(){
    listenerIds.forEach(id => {program.removeEventListener(id)});
    listenerIds = [];

    listenerIds.push(
        program.addEventListener("claimFiled", handleClaimFiled),
        program.addEventListener("vaultCreated", (e)=> console.log("Vault Created: ", e.vault.toBase58())), // why e is never ???
        program.addEventListener("claimSettled", (e)=> console.log("claim settled as : ", e.verdict? "APPROVED": "REJECTED")),
        program.addEventListener("premiumPaid", (e)=> console.log("Premium paid by: ", e.policyHolder.toBase58())), // as far as I remember there is no event related to premium paid
    );

    console.log("Listeners Registered");
}

async function reconnect(attempt: number = 1){
    const delay = Math.min(1000*2**attempt, 30_000);
    console.log(`Reconnecting in ${delay/1000}s...`);

    await new Promise(res=> setTimeout(res,delay));
    try {
        registerListeners();
        console.log("Reconnected");
    } catch (error) {
        reconnect(attempt + 1);
    }
}

function startHealthCheck() {
    setInterval(async()=>{
        try {
            await connection.getSlot();
        } catch (error) {
            console.warn("Connection lost - reconnecting...");
            reconnect();
        }
    }, 30_000);
}

export function startListener(){
    console.log("Starting event listener...");
    registerListeners();
    startHealthCheck();
}