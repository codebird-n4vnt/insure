'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { CloudRain, Plane, Shield, Loader2, CheckCircle, AlertCircle, ArrowLeft, Droplets } from 'lucide-react';
import Link from 'next/link';
import {
  getProgram, USDC_MINT, vaultTreasuryPDA, policyPDA, claimPDA,
  formatUSDC, formatDate, triggerTypeLabel, toUSDC,
} from '@/lib/anchor';

/** Extract only the human-readable message from an Anchor / RPC error. */
function extractErrorMessage(err: any): string {
  const logs: string[] | undefined = err?.logs ?? err?.transactionError?.logs;
  if (logs) {
    for (const line of logs) {
      const match = line.match(/Error Message: (.+)/);
      if (match) return match[1];
    }
  }
  const msg: string = err?.message ?? 'Transaction failed';
  return msg.split('\n')[0];
}

/** Inline error banner rendered near the triggering button. */
function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-3 mt-3 p-3 rounded-[10px] bg-error-container text-on-error-container text-[13px]">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

export default function VaultDetailPage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const [vault, setVault] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Per-action tx state
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [subscribeError, setSubscribeError] = useState('');

  const [premiumStatus, setPremiumStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [premiumError, setPremiumError] = useState('');

  const [claimStatus, setClaimStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [claimError, setClaimError] = useState('');

  const [depositStatus, setDepositStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [depositError, setDepositError] = useState('');

  const [txSig, setTxSig] = useState('');
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('');

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

  const isCreator = publicKey && vault && publicKey.toBase58() === vault.authority.toBase58();

  // ─── Subscribe ───────────────────────────────────────────────────────────────
  const handleSubscribe = async () => {
    setSubscribeStatus('loading');
    setSubscribeError('');
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
      setSubscribeStatus('success');
      await refreshPolicy(program, vaultKey);
    } catch (err: any) {
      setSubscribeError(extractErrorMessage(err));
      setSubscribeStatus('error');
    }
  };

  // ─── Pay Premium ─────────────────────────────────────────────────────────────
  const handlePayPremium = async () => {
    setPremiumStatus('loading');
    setPremiumError('');
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
      setPremiumStatus('success');
      await refreshPolicy(program, vaultKey);
    } catch (err: any) {
      setPremiumError(extractErrorMessage(err));
      setPremiumStatus('error');
    }
  };

  // ─── Raise Claim ─────────────────────────────────────────────────────────────
  const handleRaiseClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimStatus('loading');
    setClaimError('');
    try {
      const provider = getProvider();
      const program = getProgram(provider);
      const vaultKey = new PublicKey(pubkey);
      const [policyKey] = policyPDA(vaultKey, publicKey!);

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
      setClaimStatus('success');
      setShowClaimForm(false);
      setPolicy(await refreshPolicy(program, vaultKey));
    } catch (err: any) {
      setClaimError(extractErrorMessage(err));
      setClaimStatus('error');
    }
  };

  // ─── Deposit Liquidity (creator only) ────────────────────────────────────────
  const handleDepositLiquidity = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepositStatus('loading');
    setDepositError('');
    try {
      const provider = getProvider();
      const program = getProgram(provider);
      const vaultKey = new PublicKey(pubkey);
      const [treasury] = vaultTreasuryPDA(vaultKey);
      const creatorUsdc = await getAssociatedTokenAddress(USDC_MINT, publicKey!);

      const sig = await program.methods
        .depositLiquidity(toUSDC(parseFloat(depositAmount)))
        .accountsStrict({
          vault: vaultKey,
          vaultTreasury: treasury,
          creatorUsdc,
          creator: publicKey!,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setTxSig(sig);
      setDepositStatus('success');
      setDepositAmount('');
      // Refresh vault data to see updated total_liquidity
      const updatedVault = await program.account.vault.fetch(vaultKey);
      setVault(updatedVault);
    } catch (err: any) {
      setDepositError(extractErrorMessage(err));
      setDepositStatus('error');
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
              <p className="text-white/40 text-[12px] mt-1">Vault ID: {vault.vaultId?.toString() ?? '—'}</p>
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

        {/* ── Creator: Deposit Liquidity Panel ── */}
        {isCreator && (
          <div className="bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] p-[40px] floating-shadow border border-white/50 mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
                <Droplets className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-[20px] font-bold text-on-background">Deposit Liquidity</h3>
                <p className="text-[13px] text-on-surface-variant">Add more USDC to your vault's liquidity pool.</p>
              </div>
            </div>

            {depositStatus === 'success' && (
              <div className="mb-4 flex items-start gap-3 p-3 rounded-[10px] bg-green-50 text-green-800 text-[13px]">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  Liquidity deposited!{' '}
                  <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="underline">View tx</a>
                </span>
              </div>
            )}

            <form onSubmit={handleDepositLiquidity} className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="relative flex-1">
                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">$</span>
                <input
                  type="number" min="0" step="any" required
                  value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Amount in USDC"
                  className="w-full pl-10 pr-4 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold text-on-background"
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={depositStatus === 'loading' || vault.isPaused}
                  className="px-8 py-4 rounded-full font-bold bg-primary text-on-primary electric-glow hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {depositStatus === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" />Depositing...</> : 'Deposit'}
                </button>
                <ErrorBanner msg={depositError} />
              </div>
            </form>
          </div>
        )}

        {/* Action Panel (subscriber/user view) */}
        <div className="bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] p-[40px] floating-shadow border border-white/50">

          {!publicKey ? (
            <div className="text-center py-8">
              <Shield className="w-16 h-16 text-outline mx-auto mb-4" />
              <h3 className="text-[20px] font-bold text-on-background mb-2">Connect Wallet to Subscribe</h3>
              <p className="text-on-surface-variant">Connect your Solana wallet to get coverage.</p>
            </div>

          ) : isFullyActive ? (
            /* ── Subscribed + Premium Paid ── */
            <div>
              <div className="flex items-center gap-3 mb-8">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <h3 className="text-[20px] font-bold text-on-background">Coverage Active</h3>
                  <p className="text-on-surface-variant">Expires {formatDate(policy.personalCoverageEnd.toNumber())}</p>
                </div>
              </div>

              {/* Renew */}
              <div className="mb-4">
                <button
                  onClick={handlePayPremium}
                  disabled={premiumStatus === 'loading'}
                  className="bg-surface-container text-on-background border border-outline-variant px-8 py-3 rounded-full font-bold hover:border-primary/50 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {premiumStatus === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" />Processing...</> : `Renew for ${formatUSDC(vault.premiumAmount)}`}
                </button>
                <ErrorBanner msg={premiumError} />
              </div>

              {/* Raise Claim */}
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
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-4">
                      <button type="submit" disabled={claimStatus === 'loading'} className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2">
                        {claimStatus === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting...</> : 'Submit Claim'}
                      </button>
                      <button type="button" onClick={() => setShowClaimForm(false)} className="px-8 py-4 rounded-full font-bold border border-outline-variant text-on-surface-variant hover:border-primary/30 transition-all">Cancel</button>
                    </div>
                    <ErrorBanner msg={claimError} />
                  </div>
                </form>
              )}
            </div>

          ) : subscribeStep === 1 ? (
            /* ── Step 1 done, pay premium ── */
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
                disabled={premiumStatus === 'loading' || vault.isPaused}
                className={`px-10 py-5 rounded-full font-bold text-[18px] flex items-center gap-3 transition-all ${
                  vault.isPaused ? 'bg-surface-container text-on-surface-variant cursor-not-allowed' : 'bg-primary text-on-primary electric-glow hover:scale-105'
                }`}
              >
                {premiumStatus === 'loading' ? <><Loader2 className="w-5 h-5 animate-spin" />Processing...</> : vault.isPaused ? 'Vault Paused' : `Pay ${formatUSDC(vault.premiumAmount)} to Activate`}
              </button>
              <ErrorBanner msg={premiumError} />
            </div>

          ) : (
            /* ── Step 0: subscribe ── */
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
                disabled={subscribeStatus === 'loading' || vault.isPaused}
                className={`px-10 py-5 rounded-full font-bold text-[18px] flex items-center gap-3 transition-all ${
                  vault.isPaused ? 'bg-surface-container text-on-surface-variant cursor-not-allowed' : 'bg-primary text-on-primary electric-glow hover:scale-105'
                }`}
              >
                {subscribeStatus === 'loading' ? <><Loader2 className="w-5 h-5 animate-spin" />Registering...</> : vault.isPaused ? 'Vault Paused' : 'Register Account (Step 1)'}
              </button>
              <ErrorBanner msg={subscribeError} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
