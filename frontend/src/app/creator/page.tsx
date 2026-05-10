'use client';

import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { CloudRain, Plane, Plus, ArrowRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import {
  getProgram, USDC_MINT, vaultPDA, vaultTreasuryPDA, toUSDC,
} from '../../lib/anchor';

type TriggerType = 'Weather' | 'FlightDelay';
type Step = 'form' | 'loading' | 'done' | 'error';

/** Extract only the human-readable message from an Anchor / RPC error. */
function extractErrorMessage(err: any): string {
  // Anchor program errors carry a logs array — grab the first "Error Message:" line
  const logs: string[] | undefined = err?.logs ?? err?.transactionError?.logs;
  if (logs) {
    for (const line of logs) {
      const match = line.match(/Error Message: (.+)/);
      if (match) return match[1];
    }
  }
  // Fallback to the JS error message, but strip anything after a newline
  const msg: string = err?.message ?? 'Transaction failed';
  return msg.split('\n')[0];
}

export default function CreatorPage() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const connected = !!publicKey;

  const [triggerType, setTriggerType] = useState<TriggerType>('Weather');
  const [triggerThreshold, setTriggerThreshold] = useState('');
  const [premiumAmount, setPremiumAmount] = useState('');
  const [coverageAmount, setCoverageAmount] = useState('');
  const [creatorFeeBps, setCreatorFeeBps] = useState('500');
  const [depositAmount, setDepositAmount] = useState('');
  const [subscriptionStart, setSubscriptionStart] = useState('');
  const [subscriptionEnd, setSubscriptionEnd] = useState('');
  const [coverageStart, setCoverageStart] = useState('');
  const [coverageEnd, setCoverageEnd] = useState('');
  const [vaultExpiry, setVaultExpiry] = useState('');
  const [vaultId, setVaultId] = useState('0');

  const [step, setStep] = useState<Step>('form');
  const [txSig, setTxSig] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const toUnix = (dateStr: string) => Math.floor(new Date(dateStr).getTime() / 1000);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !signTransaction || !signAllTransactions) return;
    setStep('loading');
    setErrorMsg('');
    try {
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions },
        { commitment: 'confirmed' }
      );
      const program = getProgram(provider);
      const vaultIdBN = new BN(parseInt(vaultId));
      const [vaultKey] = vaultPDA(publicKey, vaultIdBN);

      // Guard: check if vault already exists
      try {
        await program.account.vault.fetch(vaultKey);
        setErrorMsg(`Vault #${vaultId} already exists for this wallet. Choose a different Vault ID.`);
        setStep('error');
        return;
      } catch {
        // Expected — vault doesn't exist yet, proceed
      }

      const triggerTypeArg = triggerType === 'Weather' ? { weather: {} } : { flightDelay: {} };
      const [treasury] = vaultTreasuryPDA(vaultKey);
      const creatorUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      await program.methods
        .initializeVault(
          vaultIdBN,
          triggerTypeArg,
          new BN(parseInt(triggerThreshold)),
          toUSDC(parseFloat(premiumAmount)),
          toUSDC(parseFloat(coverageAmount)),
          new BN(toUnix(subscriptionStart)),
          new BN(toUnix(subscriptionEnd)),
          new BN(toUnix(coverageStart)),
          new BN(toUnix(coverageEnd)),
          new BN(toUnix(vaultExpiry)),
          parseInt(creatorFeeBps)
        )
        .accountsStrict({
          authority: publicKey,
          vault: vaultKey,
          vaultTreasury: treasury,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      const depositTx = await program.methods
        .depositLiquidity(toUSDC(parseFloat(depositAmount)))
        .accountsStrict({
          vault: vaultKey,
          vaultTreasury: treasury,
          creatorUsdc,
          creator: publicKey,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setTxSig(depositTx);
      setStep('done');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(extractErrorMessage(err));
      setStep('error');
    }
  };

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center px-8 py-24">
        <div className="text-center max-w-md">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h2 className="text-[32px] font-bold text-on-background mb-4">Vault Created!</h2>
          <p className="text-on-surface-variant mb-8">Your insurance vault is live on Solana.</p>
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank" rel="noopener noreferrer"
            className="text-primary underline text-[14px] break-all"
          >
            View Transaction
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-8 py-24">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12 text-center">
          <h1 className="text-[48px] md:text-[64px] font-extrabold text-on-background mb-4 tracking-tight">
            Creator Dashboard
          </h1>
          <p className="text-[18px] text-on-surface-variant max-w-2xl mx-auto">
            Deploy a new parametric insurance vault on Solana and earn fees from every premium paid.
          </p>
        </div>

        <div className="bg-surface-container-lowest/80 backdrop-blur-md p-[40px] rounded-[16px] floating-shadow border border-white/50">
          <div className="flex items-center gap-4 mb-8 pb-8 border-b border-outline-variant">
            <div className="w-14 h-14 rounded-full bg-secondary-container flex items-center justify-center">
              <Plus className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-[24px] font-bold text-on-background">Create New Vault</h2>
              <p className="text-[16px] text-on-surface-variant">Initialize a new insurance pool on-chain.</p>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-8">
            {/* Vault ID */}
            <div>
              <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Vault ID</label>
              <input
                type="number" min="0" required value={vaultId}
                onChange={(e) => setVaultId(e.target.value)} placeholder="0"
                className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background"
              />
              <p className="text-[12px] text-on-surface-variant mt-2">
                A unique number per wallet. Each wallet can create multiple vaults by using different IDs.
              </p>
            </div>

            {/* Trigger Type */}
            <div>
              <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-4">
                Trigger Type
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['Weather', 'FlightDelay'] as TriggerType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTriggerType(type)}
                    className={`p-6 rounded-[12px] border-2 text-left transition-all flex items-start gap-4 ${
                      triggerType === type
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant bg-surface-container-lowest hover:border-primary/30'
                    }`}
                  >
                    <div className={`p-3 rounded-full flex-shrink-0 ${triggerType === type ? 'bg-primary text-on-primary' : 'bg-secondary-container text-on-secondary-container'}`}>
                      {type === 'Weather' ? <CloudRain className="w-6 h-6" /> : <Plane className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className={`text-[18px] font-bold mb-1 ${triggerType === type ? 'text-primary' : 'text-on-background'}`}>
                        {type === 'Weather' ? 'Crop Failure' : 'Flight Delay'}
                      </h3>
                      <p className="text-[14px] text-on-surface-variant">
                        {type === 'Weather' ? 'Payouts triggered by Switchboard weather oracles.' : 'Payouts triggered by flight status APIs.'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Financials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Total Coverage (USDC)</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
                  <input type="number" required value={coverageAmount} onChange={(e) => setCoverageAmount(e.target.value)} placeholder="100000"
                    className="w-full pl-10 pr-4 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold text-on-background" />
                </div>
                <p className="text-[12px] text-on-surface-variant mt-2">Amount of liquidity to provide as maximum payout.</p>
              </div>
              <div>
                <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Premium Amount (USDC)</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
                  <input type="number" required value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} placeholder="500"
                    className="w-full pl-10 pr-4 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold text-on-background" />
                </div>
                <p className="text-[12px] text-on-surface-variant mt-2">Cost for users to subscribe to this vault.</p>
              </div>
            </div>

            {/* Threshold & Fee */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Trigger Threshold</label>
                <input type="number" required value={triggerThreshold} onChange={(e) => setTriggerThreshold(e.target.value)}
                  placeholder={triggerType === 'Weather' ? 'e.g. 80 (rain mm)' : 'e.g. 120 (delay mins)'}
                  className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
                <p className="text-[12px] text-on-surface-variant mt-2">
                  {triggerType === 'Weather' ? 'Rainfall threshold in mm to trigger payout.' : 'Delay in minutes to trigger payout.'}
                </p>
              </div>
              <div>
                <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Creator Fee (bps)</label>
                <input type="number" min="0" max="10000" required value={creatorFeeBps} onChange={(e) => setCreatorFeeBps(e.target.value)} placeholder="500"
                  className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
                <p className="text-[12px] text-on-surface-variant mt-2">500 = 5% of each premium as your fee.</p>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: 'Subscription Opens', val: subscriptionStart, set: setSubscriptionStart },
                { label: 'Subscription Closes', val: subscriptionEnd, set: setSubscriptionEnd },
                { label: 'Coverage Starts', val: coverageStart, set: setCoverageStart },
                { label: 'Coverage Ends', val: coverageEnd, set: setCoverageEnd },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">{label}</label>
                  <input type="datetime-local" required value={val} onChange={(e) => set(e.target.value)}
                    className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Vault Expiry</label>
              <input type="datetime-local" required value={vaultExpiry} onChange={(e) => setVaultExpiry(e.target.value)}
                className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
            </div>

            {/* Deposit */}
            <div className="pt-8 border-t border-outline-variant">
              <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Initial Liquidity Deposit (USDC)</label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
                <input type="number" required value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="50000"
                  className="w-full pl-10 pr-4 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold text-on-background" />
              </div>
              <p className="text-[12px] text-on-surface-variant mt-2">USDC you deposit as the insurance liquidity pool.</p>
            </div>

            {/* Error — shown just above the submit button */}
            {step === 'error' && (
              <div className="flex items-start gap-3 p-4 rounded-[12px] bg-error-container text-on-error-container">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <p className="text-[14px]">{errorMsg}</p>
              </div>
            )}

            <div>
              <button type="submit" disabled={!connected || step === 'loading'}
                className={`w-full py-5 rounded-full font-bold text-[18px] flex items-center justify-center gap-3 transition-all ${
                  connected ? 'bg-primary text-on-primary electric-glow hover:scale-[1.01]' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                }`}
              >
                {step === 'loading' ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Creating Vault...</>
                ) : connected ? (
                  <><span>Create Vault</span><ArrowRight className="w-5 h-5" /></>
                ) : 'Connect Wallet to Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
