import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import * as sb from "@switchboard-xyz/on-demand";
import { OracleQuote } from "@switchboard-xyz/on-demand";
import { FeedHash, OracleJob } from "@switchboard-xyz/common";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { registerExactSvmScheme } from "@x402/svm";
import { toClientSvmSigner } from "@x402/svm";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token"




import { GoogleGenAI, Type } from "@google/genai";
import { Insure } from "../../types/insure";



type TriggerType = "Weather" | "FlightDelay";
interface WeatherClaimData {
  triggerType: "Weather";
  lat: number;
  lng: number;
}

interface FlightClaimData {
  triggerType: "FlightDelay";
  flightNumber: string;
  flightDate: string;  /// but in the solana program it was stored as a timestamp number
}

type ClaimData = WeatherClaimData | FlightClaimData;

interface GeminiVerdict {
  verdict: boolean;
  confidence: number;
  reason: string;
}

interface OracleResult {
  verdict: boolean,
  confidence: number,
  reason: string,
  oracleValue: number, // 1 = approved, 0 = rejected
  txSignature: string,
  quoteAccount: PublicKey
}

async function fetchWeatherData(lat: number, lng: number): Promise<any> {
  const url = `https://api.openweathermap.org/data/2.5/weather` +
    `?lat=${lat}&lon=${lng}` +
    `&appid=${process.env.WEATHER_API_KEY}` +
    `&units=metric`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Weather API failed: ${response.status}`);
  }

  return await response.json();
}

async function fetchFlightData(
  flightNumber: String,
  flightDate: string
): Promise<any> {
  const url =
    `https://api.aviationstack.com/v1/flights` +
    `?flight_iata=${flightNumber}` +
    `&flight_date=${flightDate}` +
    `&access_key=${process.env.AVIATION_API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Aviation API failed : ${response.status}`);
  }

  return await response.json();
}

const verdictSchema = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.BOOLEAN,
      description: "true = approve claim, false = reject claim",
      nullable: false
    },
    confidence: {
      type: Type.NUMBER,
      description: "confidence score between 0.0 and 1.0",
      nullable: false
    },
    reason: {
      type: Type.STRING,
      description: "one sentence explaination of the decision",
      nullable: false,
    },
  },
  required: ["verdict", "confidence", "reason"],
};



// export async function resolveClaimOracle(
//     program: Program,
//     keypair: Keypair,
//     connection: Connection,
//     claimPubkey: PublicKey,
//     vaultPubkey: PublicKey,
//     triggerType: "Weather" | "FlightDelay",  /// verify all parameteres later
//     claimData: {
//       lat?: number,
//       lng?: number,
//       flightNumber?: string,
//       flightData?: string,
//     }
//   ){

//     const {crossbar} = await sb.AnchorUtils.loadEnv();

//     const oracleFeed = 
//       triggerType === "Weather"
//         ? buildWeatherFeed(claimData.lat!, claimData.lng!)
//         : buildFlightFeed
// }




// function normalizeClaimData(claimData: any) {
//   if (claimData.weather) {
//     return { type: "Weather", ...claimData.weather };
//   }

//   if (claimData.flightDelay) {
//     return { type: "FlightDelay", ...claimData.flightDelay };
//   }

//   throw new Error("Unknown ClaimData variant");
// }

export async function callGeminiForVerdict(triggerType: TriggerType, rawData: any, threshold: number): Promise<GeminiVerdict> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let prompt = "";

  if (triggerType === "Weather") {
    prompt = `
      You are a parametric crop insurance claim evaluator.

      Vault trigger: payout if drought conditions exist.

      Configured threshold: rainfall below ${threshold}mm triggers payout.

      Raw weather API data for this farm:
      ${JSON.stringify(rawData, null, 2)}

      Analyze ALL signals carefully:
      - Rainfall amount and patterns
      - Temperature and heat stress
      - Humidity levels
      - Wind speed
      - Season and crop context

      Do not just compare rainfall vs threshold mechanically.
      Reason about whether actual drought damage likely occurred
      considering all environmental factors together.
    `;
  }

  if (triggerType === "FlightDelay") {
    prompt = `
      You are a parametric flight delay insurance claim evaluator.

      Vault trigger: payout if flight delayed beyond ${threshold} minutes.

      Raw flight API data:
      ${JSON.stringify(rawData, null, 2)}

      Consider carefully:
      - Actual arrival delay in minutes
      - If flight was cancelled, treat as maximum delay (payout = true)
      - If flight was diverted, treat as delayed
      - Early arrival does not offset a departure delay
      - Missing flight data = flag low confidence
    `;
  }


  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      thinkingConfig: {
        includeThoughts: false,
      },

      responseMimeType: "application/json",
      responseSchema: verdictSchema,
    },
  })

  const result = JSON.parse(response.text as string);

  return {
    verdict: result.verdict,
    confidence: result.confidence,
    reason: result.reason
  }
}

async function derivex402Signature(
  keypair: Keypair,
  probeUrl: string,
): Promise<string> {
  const signer = await createKeyPairSignerFromBytes(keypair.secretKey);
  const client = new x402Client();

  registerExactSvmScheme(client, {
    signer: toClientSvmSigner(signer)
  })

  const probeResponse = await fetch(probeUrl)
  const httpClient = new x402HTTPClient(client);

  const paymentRequired = httpClient.getPaymentRequiredResponse((name) => probeResponse.headers.get(name), await probeResponse.json().catch(() => undefined));

  const paymentPayload = await client.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

  console.log("x402 payment signature derived");

  return paymentHeaders["PAYMENT-SIGNATURE"];
}


function buildOracleFeed(oracleValue: number) {
  return {
    name: "AI Claim Verification Result",
    minJobResponses: 1,
    minOracleSamples: 1,
    maxJobRangePct: 0,
    jobs: [
      {
        tasks: [
          {
            valueTask: {
              value: oracleValue,
            }
          }
        ]
      }
    ]
  }
}


async function buildSettleClaimIx(
  program: Program<Insure>,
  claimPubkey: PublicKey,
  vaultPubkey: PublicKey,
  policyPubkey: PublicKey,
  quoteAccount: PublicKey,
  claimant: PublicKey,
  usdcMint: PublicKey
){
  const [vaultTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), vaultPubkey.toBuffer()],
    program.programId
  );

  const claimantUsdc = await getAssociatedTokenAddress(
    usdcMint,
    claimant
  );

  return await program.methods
    .settleClaim()
    .accountsStrict({
      claim: claimPubkey,
      policy: policyPubkey,
      vault: vaultPubkey,
      quoteAccount: quoteAccount,
      vaultTreasury: vaultTreasury,
      claimantUsdc: claimantUsdc,
      usdcMint: usdcMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();
}

export async function resolveClaimOracle(
  program: Program<Insure>,
  keypair: Keypair,
  connection: Connection,
  claimPubkey: PublicKey,
  vaultPubkey: PublicKey,
  claimant: PublicKey,
  usdcMint: PublicKey,
  threshold: number,
  claimData: ClaimData
): Promise<OracleResult>{


  console.log("Fetching raw data...");

  let rawData: any;
  let probeUrl: string;

  if(claimData.triggerType === "Weather"){
    rawData = await fetchWeatherData(claimData.lat, claimData.lng);
    probeUrl = 
      `https://api.openweathermap.org/data/2.5/weather` +
      `?lat=${claimData.lat}&lon=${claimData.lng}` +
      `&appid=${process.env.WEATHER_API_KEY}`;
  } else {
    rawData = await fetchFlightData(claimData.flightNumber, claimData.flightDate);
    probeUrl = 
      `https://api.aviationstack.com/v1/flights` +
      `?flight_iata=${claimData.flightNumber}` +
      `&access_key=${process.env.AVIATION_API_KEY}`;
  }

  console.log("Raw data fetched");

  console.log("Calling Gemini....");

  const aiVerdict = await callGeminiForVerdict(
    claimData.triggerType,
    rawData,
    threshold
  );

  if(aiVerdict.confidence < 0.75){
    throw new Error(
      `Gemini confidence too low (${aiVerdict.confidence}). `+
      `Manual review required. Reason: ${aiVerdict.reason}`
    );
  }

  const oracleValue = aiVerdict.verdict ? 1 : 0;

  console.log("Deriving x402 signature...");
  const paymentSignature = await derivex402Signature(keypair, probeUrl);
  
  console.log("Settting up Switchboard...");
  
  const { program: sbProgram, crossbar } = await sb.AnchorUtils.loadEnv();
  const oracleFeed = buildOracleFeed(oracleValue);
  const feedId = FeedHash.computeOracleFeedId(oracleFeed);
  const queue = await sb.Queue.loadDefault(sbProgram!);

  const [quoteAccount] = OracleQuote.getCanonicalPubkey(
    queue.pubkey,
    [feedId]
  );

  console.log("Quote Account:", quoteAccount.toBase58());

  const oracleIxs = await queue.fetchManagedUpdateIxs(
    crossbar,
    [oracleFeed],
    {
      numSignatures: 1,
      variableOverrides: {
        X402_PAYMENT_SIGNATURE: paymentSignature
      },
      instructionIdx: 0,
      payer: keypair.publicKey,
    }
  );


  const [policyPubkey] = PublicKey.findProgramAddressSync([Buffer.from("policy"),vaultPubkey.toBuffer(),claimant.toBuffer()], program.programId);
  console.log("Building settle_claim instruction...");

  const settleClaimIx = await buildSettleClaimIx(
    program,
    claimPubkey,
    vaultPubkey,
    policyPubkey,
    quoteAccount,
    claimant,
    usdcMint
  );


  const tx = await sb.asV0Tx({
    connection,
    ixs:[
      ...oracleIxs,
      settleClaimIx
    ],
    signers: [keypair],
    computeUnitPrice: 20_000,
    computeUnitLimitMultiple: 1.1,
  })


  console.log("Simulating transaction...");

  const sim = await connection.simulateTransaction(tx);

  if(sim.value.err){
    console.error("Simulation logs:", sim.value.logs?.join("\n"));
    throw new Error(`Transaction simulation failed: ${sim.value.err}`);
  }
  
  console.log("Simulation passed");

  console.log("Sending transaction...");

  const txSignature = await connection.sendTransaction(tx,{
    skipPreflight: false,
    preflightCommitment: "confirmed"
  });

  await connection.confirmTransaction(txSignature, "confirmed");

  console.log("CLAIM SETTLED");
  console.log("Txn:         ", txSignature);
  console.log("Verdict:     ", aiVerdict.verdict ? "APPROVED" : "REJECTED");
  console.log("Reason:      ", aiVerdict.reason);

  return {
    verdict:      aiVerdict.verdict,
    confidence:   aiVerdict.confidence,
    reason:       aiVerdict.reason,
    oracleValue,
    txSignature,
    quoteAccount,
  };

}


// const normalizedClaimData: any = normalizeClaimData(rawData);

// const fetchClaimDataDecl = {
//   name: "fetch_claim_data",
//   description: "Fetches raw data for a claim based on trigger type",
//   parameters: {
//     type: Type.OBJECT,
//     properties: {
//       triggerType: { type: Type.STRING, enum: ["Weather", "FlightDelay"] },
//       latitude: { type: Type.NUMBER },
//       longitude: { type: Type.NUMBER },
//       flightNumber: { type: Type.STRING },
//       flightDate: { type: Type.INTEGER },
//       threshold: { type: Type.NUMBER },
//     },
//     required: ["triggerType", "threshold"],
//   },
// };

// const toolRequest = await ai.models.generateContent({
//   model: "gemini-3-flash-preview",
//   contents: "Fetch claim data for this policyholder.",
//   config: {
//     tools: [{ functionDeclarations: [fetchClaimDataDecl] }],
//     thinkingConfig: { includeThoughts: true },
//   },
// });

// const fc = toolRequest.functionCalls?.[0];
// if (!fc || fc.name !== "fetch_claim_data") throw new Error("No function call");


// const verdictResp = await ai.models.generateContent({
//   model: "gemini-3-flash-preview",
//   contents: `
//   You are a parametric insurance evaluator.

//   Trigger: ${fc.args?.triggerType}
//   Threshold: ${fc.args?.threshold}

//   Raw data:
//   ${JSON.stringify(rawData, null, 2)} 

//   Return ONLY JSON:
//   {"verdict": true|false, "confidence":0.0-1.0, "reason"-"one sentence"}
//   `.trim(),
//   config: {
//     thinkingConfig: { includeThoughts: true },
//   },
// });

// const text = verdictResp.candidates?.[0]?.content?.parts?.map(p => p.text ?? "").join("") ?? "";
// const verdict = JSON.parse(text);

// if (verdict.confidence < 0.75) throw new Error("Low confidence");
// const oracleValue = verdict.verdict ? 1 : 0;
// }

// Thinking


// const ai = new GoogleGenAI({});

// async function main() {
//   const response = await ai.models.generateContent({
//     model: "gemini-3-flash-preview",
//     contents: "What is the sum of the first 50 prime numbers?",
//     config: {
//       thinkingConfig: {
//         includeThoughts: true,
//       },
//     },
//   });

//   for (const part of response.candidates[0].content.parts) {
//     if (!part.text) {
//       continue;
//     }
//     else if (part.thought) {
//       console.log("Thoughts summary:");
//       console.log(part.text);
//     }
//     else {
//       console.log("Answer:");
//       console.log(part.text);
//     }
//   }
// }

// main();




// // Function generation
// import { GoogleGenAI, Type } from '@google/genai';

// // Configure the client
// const ai = new GoogleGenAI({});

// // Define the function declaration for the model
// const weatherFunctionDeclaration = {
//   name: 'get_current_temperature',
//   description: 'Gets the current temperature for a given location.',
//   parameters: {
//     type: Type.OBJECT,
//     properties: {
//       location: {
//         type: Type.STRING,
//         description: 'The city name, e.g. San Francisco',
//       },
//     },
//     required: ['location'],
//   },
// };

// // Send request with function declarations
// const response = await ai.models.generateContent({
//   model: 'gemini-3-flash-preview',
//   contents: "What's the temperature in London?",
//   config: {
//     tools: [{
//       functionDeclarations: [weatherFunctionDeclaration]
//     }],
//   },
// });

// // Check for function calls in the response
// if (response.functionCalls && response.functionCalls.length > 0) {
//   const functionCall = response.functionCalls[0]; // Assuming one function call
//   console.log(`Function to call: ${functionCall.name}`);
//   console.log(`ID: ${functionCall.id}`);
//   console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);
//   // In a real app, you would call your actual function here:
//   // const result = await getCurrentTemperature(functionCall.args);
// } else {
//   console.log("No function call found in the response.");
//   console.log(response.text);
// }