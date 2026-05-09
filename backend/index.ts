import express from "express";
import cors from "cors";
import {startListener} from "./listener";

import {
    getAllVaults,
    getPoliciesForVault,
    getClaimsForVault,
    getUserPolicy,
    getUserClaims,
} from "./indexer"

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/vaults", async (__,res)=> res.json(await getAllVaults()));
app.get("/vaults/:address/policies", async (req,res) => res.json(await getPoliciesForVault(req.params.address)));
app.get("/vaults/:address/claims", async (req,res) => res.json(await getClaimsForVault(req.params.address)));
app.get("/policy/:vault/:wallet", async (req,res) => res.json(await getUserPolicy(req.params.vault, req.params.wallet)));
app.get("/claims/:wallet", async (req,res) => res.json(await getUserClaims(req.params.wallet)));

app.listen(PORT, ()=>{
    console.log(`Backend running on port ${PORT}`);
    startListener();
})