
// import { Account } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { program, PROGRAM_ID } from "./connection";



export async function getAllVaults() {
    const vaults = await program.account.vault.all();
    return vaults.map(({ publicKey, account }) => ({
        address: publicKey.toBase58(),
        authority: account.authority.toBase58(),
        triggerType: account.triggerType,
        triggerThreshold: account.triggerThreshold.toNumber(), // why it is in camel casing even when in the rust code we use snake casing to save the files
        premiumAmount: account.premiumAmount.toNumber(),
        coverageAmount: account.coverageAmount.toNumber(),
        subscriptionStart: account.subscriptionStart.toNumber(),
        subscriptionEnd: account.subscriptionEnd.toNumber(),
        coverageStart: account.coverageStart.toNumber(),
        coverageEnd: account.coverageEnd.toNumber(),
        vaultExpiry: account.vaultExpiry.toNumber(),
        creatorFeeBps: account.creatorFeeBps,
        totalPremiumsCollected: account.totalPremiumsCollected.toNumber(),
        totalClaimsPaid: account.totalClaimsPaid.toNumber(),
        totalLiquidity: account.totalLiquidity.toNumber(),
        totalPolicies: account.totalPolicies.toNumber(),
        totalclaims: account.totalClaims.toNumber(),
    }));
}

export async function getPoliciesForVault(vaultAddress: string) {
    const vaultPubkey = new PublicKey(vaultAddress);
    const policies = await program.account.policyHolder.all([
        { memcmp: { offset: 8, bytes: vaultPubkey.toBase58() } },
    ]);

    return policies.map(({ publicKey, account }) => ({
        address: publicKey.toBase58(),
        vault: account.vault.toBase58(),
        owner: account.owner.toBase58(),
        isSubscribed: account.isSubscribed,
        personalCoverageEnd: account.personalCoverageEnd,
        totalPremiumsPaid: account.totalPremiumsPaid.toNumber(),
        claimCount: account.claimCount.toNumber(),
    }));
}

export async function getClaimsForVault(vaultAddress: string) {
    const vaultPubkey = new PublicKey(vaultAddress);
    const claims = await program.account.claim.all([
        { memcmp: { offset: 8, bytes: vaultPubkey.toBase58() } },
    ]);
    return claims.map(({ publicKey, account }) => ({
        address: publicKey.toBase58(),
        vault: account.vault.toBase58(),
        claimant: account.claimant.toBase58(),
        claimNumber: account.claimNumber.toNumber(),
        status: account.status,
        claimData: account.claimData,
        payoutAmount: account.payoutAmount.toNumber(),
        filedAt: account.filedAt.toNumber(),
        settledAt: account.settledAt.toNumber(),
    }));
}

export async function getUserPolicy(vaultAddress: string, walletAddress: string) {
    const [policyPda] = PublicKey.findProgramAddressSync(
        [
            Buffer.from("policy"),
            new PublicKey(vaultAddress).toBuffer(),
            new PublicKey(walletAddress).toBuffer(),
        ],
        PROGRAM_ID
    );

    try {
        const account = await program.account.policyHolder.fetch(policyPda);
        return { address: policyPda.toBase58(), ...account };
    } catch (error) {
        return null;
    }
}

export async function getUserClaims(walletAddress: string) {
    const walletPubkey = new PublicKey(walletAddress);
    const claims = await program.account.claim.all([
        { memcmp: { offset: 8 + 32, bytes: walletPubkey.toBase58() } },
    ]);

    return claims.map(({ publicKey, account }) => ({
        address: publicKey.toBase58(),
        vault: account.vault.toBase58(),
        claimant: account.claimant.toBase58(),
        status: account.status,
        payoutAmount: account.payoutAmount.toNumber(),
        filedAt: account.filedAt.toNumber(),
        settledAt: account.settledAt.toNumber(),
    }));
}