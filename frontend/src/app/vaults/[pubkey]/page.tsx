'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { CloudRain, Plane, Shield, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  getProgram, USDC_MINT, vaultTreasuryPDA, policyPDA, claimPDA,
  formatUSDC, formatDate, triggerTypeLabel,
} from '@/lib/anchor';

export default function VaultDetailPage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const [vault, setVault] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [txStatus, setTxStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [txSig, setTxSig] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [flightDate, setFlightDate] = useState('');

  // Step 1 = "Subscribe" (creates PolicyHolder PDA, no token transfer)
  // Step 2 = "Pay Premium" (transfers USDC, activates coverage)
  // null = not subscribed yet
  const subscribeStep: 1 | 2 | null = policy === null ? null : (!policy.isSubscribed ? 1 : 2);

  const refreshPolicy = async (program: any, vaultKey: PublicKey) => {
    if (!publicKey) return;
    try {
      const [policyKey] = policyPDA(vaultKey, publicKey);
      const policyData = await program.account.policyHolder.fetch(policyKey);
      setPolicy(policyData);
      return policyData;
    } catch {
      setPolicy(null);
      return null;
    }
  };

  useEffect(() => {
    async function load() {
      if (!pubkey) return;
      setLoading(true);
      try {
        const dummyWallet = {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        };
        const provider = new AnchorProvider(
          connection,
          publicKey
            ? { publicKey, signTransaction: signTransaction!, signAllTransactions: signAllTransactions! }
            : (dummyWallet as any),
          { commitment: 'confirmed' }
        );
        const program = getProgram(provider);
        const vaultKey = new PublicKey(pubkey);
        const vaultData = await program.account.vault.fetch(vaultKey);
        setVault(vaultData);
        await refreshPolicy(program, vaultKey);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, [pubkey, connection, publicKey]);

  const getProvider = () => {
    if (!publicKey || !signTransaction || !signAllTransactions) throw new Error('Wallet not connected');
    return new AnchorProvider(connection, { publicKey, signTransaction, signAllTransactions }, { commitment: 'confirmed' });
  };

  // ─── Step 1: subscribe() — creates PolicyHolder account, no USDC ───
  const handleSubscribe = async () => {
    setTxStatus('loading');
    setErrorMsg('');
    try {
      const provider = getProvider();
      const program = getProgram(provider);
      const vaultKey = new PublicKey(pubkey);
      const [policyKey] = policyPDA(vaultKey, publicKey!);

      const sig = await program.methods
        .subscribe()
        .accountsStrict({
          vault: vaultKey,
          policy: policyKey,
          owner: publicKey!,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      setTxStatus('success');
      // Refresh so we see the new policy account and advance to step 2
      await refreshPolicy(program, vaultKey);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Transaction failed');
      setTxStatus('error');
    }
  };

  // ─── Step 2: pay_premium() — transfers USDC, activates coverage ───
  const handlePayPremium = async () => {
    setTxStatus('loading');
    setErrorMsg('');
    try {
      const provider = getProvider();
      const program = getProgram(provider);
      const vaultKey = new PublicKey(pubkey);
      const [policyKey] = policyPDA(vaultKey, publicKey!);
      const [treasury] = vaultTreasuryPDA(vaultKey);
      const ownerUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey!);
      const creatorUsdc = await getAssociatedTokenAddress(USDC_MINT, vault.authority);

      const sig = await program.methods
        .payPremium()
        .accountsStrict({
          vault: vaultKey,
          policy: policyKey,
          ownerUsdc,
          vaultTreasury: treasury,
          creatorUsdc,
          usdcMint: USDC_MINT,
          owner: publicKey!,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setTxSig(sig);
      setTxStatus('success');
      await refreshPolicy(program, vaultKey);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Transaction failed');
      setTxStatus('error');
    }
  };

  // ─── Raise Claim ───
  const handleRaiseClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxStatus('loading');
    setErrorMsg('');
    try {
      const provider = getProvider();
      const program = getProgram(provider);
      const vaultKey = new PublicKey(pubkey);
      const [policyKey] = policyPDA(vaultKey, publicKey!);

      // Always re-fetch fresh policy to get latest claimCount — avoids stale PDA
      const freshPolicy = await program.account.policyHolder.fetch(policyKey);
      const claimNumber = new BN(freshPolicy.claimCount.toNumber());

      const [claimKey] = claimPDA(vaultKey, publicKey!, claimNumber);
      const claimantUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey!);
      const [treasury] = vaultTreasuryPDA(vaultKey);
      const type = triggerTypeLabel(vault.triggerType);

      const claimData =
        type === 'Weather'
          ? { weather: { latitude: parseFloat(latitude), longitude: parseFloat(longitude) } }
          : {
              flightDelay: {
                flightNumber: flightNumber.trim(),
                flightDate: new BN(Math.floor(new Date(flightDate).getTime() / 1000)),
              },
            };

      const sig = await program.methods
        .raiseClaim(claimData)
        .accountsStrict({
          claimant: publicKey!,
          vault: vaultKey,
          policy: policyKey,
          claim: claimKey,
          claimantUsdc,
          vaultTreasury: treasury,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxSig(sig);
      setTxStatus('success');
      setShowClaimForm(false);
      setPolicy(await refreshPolicy(program, vaultKey));
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Claim failed');
      setTxStatus('error');
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  if (!vault)
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-8">
        <div>
          <AlertCircle className="w-16 h-16 text-error mx-auto mb-4" />
          <h2 className="text-[24px] font-bold text-on-background mb-2">Vault Not Found</h2>
          <Link href="/vaults" className="text-primary hover:underline">← Back to Vaults</Link>
        </div>
      </div>
    );

  const type = triggerTypeLabel(vault.triggerType);
  const isWeather = type === 'Weather';
  const isFullyActive = policy?.isSubscribed ?? false;

  return (
    <div className="min-h-screen px-8 py-24">
      <div className="max-w-[1280px] mx-auto">
        <Link href="/vaults" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors mb-8 text-[14px] font-bold">
          <ArrowLeft className="w-4 h-4" /> Back to Vaults
        </Link>

        {/* Header */}
        <div className="bg-on-background rounded-[16px] p-12 text-white mb-8 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
            <div>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 text-[12px] font-bold tracking-[0.1em] uppercase ${
                isWeather ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-container/40 text-on-tertiary-container'
              }`}>
                {isWeather ? <CloudRain className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
                {isWeather ? 'Crop Failure Vault' : 'Flight Delay Vault'}
              </div>
              <h1 className="text-[36px] font-bold mb-2">Insurance Vault</h1>
              <p className="text-white/60 text-[14px] font-mono break-all">{pubkey}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-white/60 text-[12px] font-bold tracking-[0.1em] uppercase mb-1">Coverage Ends</p>
              <p className="text-[24px] font-bold">{formatDate(vault.coverageEnd.toNumber())}</p>
            </div>
          </div>
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Liquidity', value: formatUSDC(vault.totalLiquidity) },
            { label: 'Coverage Amount', value: formatUSDC(vault.coverageAmount) },
            { label: 'Premium / Month', value: formatUSDC(vault.premiumAmount) },
            { label: 'Active Policies', value: vault.totalPolicies.toString() },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] p-6 floating-shadow border border-white/50">
              <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-2">{stat.label}</p>
              <p className="text-[22px] font-bold text-on-background">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Action Panel */}
        <div className="bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] p-[40px] floating-shadow border border-white/50">

          {/* Tx feedback */}
          {txStatus === 'success' && (
            <div className="mb-6 p-4 rounded-[12px] bg-green-50 text-green-800 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold">Transaction Confirmed!</p>
                <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="text-[13px] underline break-all">{txSig}</a>
              </div>
            </div>
          )}
          {txStatus === 'error' && (
            <div className="mb-6 p-4 rounded-[12px] bg-error-container text-on-error-container flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          {!publicKey ? (
            <div className="text-center py-8">
              <Shield className="w-16 h-16 text-outline mx-auto mb-4" />
              <h3 className="text-[20px] font-bold text-on-background mb-2">Connect Wallet to Subscribe</h3>
              <p className="text-on-surface-variant">Connect your Solana wallet to get coverage.</p>
            </div>

          ) : isFullyActive ? (
            /* ── Subscribed + Premium Paid: show claim UI ── */
            <div>
              <div className="flex items-center gap-3 mb-8">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <h3 className="text-[20px] font-bold text-on-background">Coverage Active</h3>
                  <p className="text-on-surface-variant">Expires {formatDate(policy.personalCoverageEnd.toNumber())}</p>
                </div>
              </div>

              {/* Pay next month's premium */}
              <button
                onClick={handlePayPremium}
                disabled={txStatus === 'loading'}
                className="mb-4 bg-surface-container text-on-background border border-outline-variant px-8 py-3 rounded-full font-bold hover:border-primary/50 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {txStatus === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" />Processing...</> : `Renew for ${formatUSDC(vault.premiumAmount)}`}
              </button>

              {!showClaimForm ? (
                <button onClick={() => setShowClaimForm(true)} className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow hover:scale-105 transition-transform">
                  Raise a Claim
                </button>
              ) : (
                <form onSubmit={handleRaiseClaim} className="space-y-6 border-t border-outline-variant pt-8">
                  <h4 className="text-[20px] font-bold text-on-background">Raise Claim</h4>
                  {isWeather ? (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Latitude</label>
                        <input type="number" step="any" required value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="e.g. 10.8505"
                          className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
                      </div>
                      <div>
                        <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Longitude</label>
                        <input type="number" step="any" required value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="e.g. 76.2711"
                          className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Flight Number</label>
                        <input type="text" required value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="e.g. AI101"
                          className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
                      </div>
                      <div>
                        <label className="block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2">Flight Date</label>
                        <input type="date" required value={flightDate} onChange={(e) => setFlightDate(e.target.value)}
                          className="w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background" />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <button type="submit" disabled={txStatus === 'loading'} className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2">
                      {txStatus === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : 'Submit Claim'}
                    </button>
                    <button type="button" onClick={() => setShowClaimForm(false)} className="px-8 py-4 rounded-full font-bold border border-outline-variant text-on-surface-variant hover:border-primary/30 transition-all">Cancel</button>
                  </div>
                </form>
              )}
            </div>

          ) : subscribeStep === 1 ? (
            /* ── Step 1: PolicyHolder exists but not subscribed yet ── */
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-[14px]">1</div>
                <h3 className="text-[20px] font-bold text-on-background line-through text-outline">Subscribe</h3>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center text-[14px]">2</div>
                <h3 className="text-[20px] font-bold text-on-background">Pay First Premium</h3>
              </div>
              <p className="text-on-surface-variant mb-8">
                Your account is registered. Now pay the first premium of <strong>{formatUSDC(vault.premiumAmount)}</strong> USDC to activate coverage.
              </p>
              <button
                onClick={handlePayPremium}
                disabled={txStatus === 'loading' || vault.isPaused}
                className={`px-10 py-5 rounded-full font-bold text-[18px] flex items-center gap-3 transition-all ${
                  vault.isPaused ? 'bg-surface-container text-on-surface-variant cursor-not-allowed' : 'bg-primary text-on-primary electric-glow hover:scale-105'
                }`}
              >
                {txStatus === 'loading' ? <><Loader2 className="w-5 h-5 animate-spin" />Processing...</> : vault.isPaused ? 'Vault Paused' : `Pay ${formatUSDC(vault.premiumAmount)} to Activate`}
              </button>
            </div>

          ) : (
            /* ── Step 0: No policy account yet — call subscribe() ── */
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center text-[14px]">1</div>
                <h3 className="text-[20px] font-bold text-on-background">Subscribe</h3>
              </div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 rounded-full bg-surface-container text-on-surface-variant font-bold flex items-center justify-center text-[14px]">2</div>
                <h3 className="text-[20px] font-bold text-outline">Pay First Premium</h3>
              </div>
              <p className="text-on-surface-variant mb-8">
                Get coverage for <strong>{formatUSDC(vault.premiumAmount)}</strong>/month. First, register your account (no USDC required), then pay the premium to activate.
              </p>
              <button
                onClick={handleSubscribe}
                disabled={txStatus === 'loading' || vault.isPaused}
                className={`px-10 py-5 rounded-full font-bold text-[18px] flex items-center gap-3 transition-all ${
                  vault.isPaused ? 'bg-surface-container text-on-surface-variant cursor-not-allowed' : 'bg-primary text-on-primary electric-glow hover:scale-105'
                }`}
              >
                {txStatus === 'loading' ? <><Loader2 className="w-5 h-5 animate-spin" />Registering...</> : vault.isPaused ? 'Vault Paused' : 'Register Account (Step 1)'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
