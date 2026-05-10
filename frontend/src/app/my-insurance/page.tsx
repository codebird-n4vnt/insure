'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { Shield, CloudRain, Plane, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getProgram, formatUSDC, formatDate, triggerTypeLabel, claimPDA, claimStatusLabel, claimDataSummary } from '@/lib/anchor';
import { PublicKey } from '@solana/web3.js';

type ClaimEntry = { key: string; account: any };
type PolicyEntry = { publicKey: string; account: any; vaultAccount: any; claims: ClaimEntry[] };

export default function MyInsurancePage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!publicKey) { setLoading(false); return; }
    async function load() {
      setLoading(true);
      try {
        const provider = new AnchorProvider(
          connection,
          { publicKey: publicKey!, signTransaction: signTransaction!, signAllTransactions: signAllTransactions! },
          { commitment: 'confirmed' }
        );
        const program = getProgram(provider);

        // Fetch all PolicyHolder accounts owned by this user
        // offset 8 (discriminator) + 32 (vault pubkey) = offset 40 for owner field
        const userPolicies = await program.account.policyHolder.all([
          { memcmp: { offset: 8 + 32, bytes: publicKey!.toBase58() } },
        ]);

        const withVaultsAndClaims = await Promise.all(
          userPolicies.map(async (p) => {
            try {
              const vaultAccount = await program.account.vault.fetch(p.account.vault);
              const claimCount: number = p.account.claimCount.toNumber();
              const vaultKey = p.account.vault as PublicKey;

              // Fetch each claim PDA for this user + vault
              const claims: ClaimEntry[] = [];
              for (let i = 0; i < claimCount; i++) {
                try {
                  const [claimKey] = claimPDA(vaultKey, publicKey!, new BN(i));
                  const acc = await program.account.claim.fetch(claimKey);
                  claims.push({ key: claimKey.toBase58(), account: acc });
                } catch { /* skip missing */ }
              }

              return { publicKey: p.publicKey.toBase58(), account: p.account, vaultAccount, claims };
            } catch { return null; }
          })
        );
        setPolicies(withVaultsAndClaims.filter(Boolean) as PolicyEntry[]);
      } catch (err) {
        console.error('Failed to load policies:', err);
      }
      setLoading(false);
    }
    load();
  }, [publicKey, connection]);

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!publicKey) {
    return (
      <div className="min-h-screen flex items-center justify-center px-8 py-24">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 bg-secondary-container rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-12 h-12 text-primary" />
          </div>
          <h2 className="text-[32px] font-bold text-on-background mb-4">Connect Your Wallet</h2>
          <p className="text-[18px] text-on-surface-variant">Connect your Solana wallet to view your active insurance policies and claim history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-8 py-24">
      <div className="max-w-[1280px] mx-auto">
        <div className="mb-12">
          <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary mb-2">Your Portfolio</p>
          <h1 className="text-[48px] md:text-[64px] font-extrabold text-on-background mb-4 tracking-tight">My Insurance</h1>
          <p className="text-[18px] text-on-surface-variant">Manage your active policies and track automated payouts.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-40"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>
        ) : policies.length === 0 ? (
          <div className="text-center py-40 bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50">
            <Shield className="w-16 h-16 text-outline mx-auto mb-6" />
            <h3 className="text-[24px] font-bold text-on-background mb-2">No Policies Yet</h3>
            <p className="text-on-surface-variant mb-8">You haven't subscribed to any insurance vaults yet.</p>
            <Link href="/vaults" className="inline-flex items-center gap-2 bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow hover:scale-105 transition-transform">
              Browse Vaults
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {policies.map((p) => {
              const type = triggerTypeLabel(p.vaultAccount.triggerType);
              const isWeather = type === 'Weather';
              const now = Math.floor(Date.now() / 1000);
              const personalCoverageEnd = p.account.personalCoverageEnd.toNumber();
              const hasPremium = personalCoverageEnd > 0;
              const isActive = hasPremium && personalCoverageEnd > now;
              // Subscribed (subscribe() called) but premium not yet paid
              const isRegistered = p.account.isSubscribed && !hasPremium;
              const coverageStatus = isActive ? 'Active' : isRegistered ? 'Registered' : 'Expired';
              const badgeClasses = isActive
                ? 'bg-green-100 text-green-700'
                : isRegistered
                ? 'bg-amber-100 text-amber-700'
                : 'bg-surface-container text-on-surface-variant';
              const showClaims = expanded[p.publicKey] ?? false;

              return (
                <div key={p.publicKey} className="bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50 p-[32px]">
                  {/* Policy header row */}
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-start gap-6">
                      <div className={`p-4 rounded-[12px] flex-shrink-0 ${isWeather ? 'bg-secondary-container' : 'bg-tertiary-container/40'}`}>
                        {isWeather ? <CloudRain className="w-8 h-8 text-on-secondary-container" /> : <Plane className="w-8 h-8 text-on-tertiary-container" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-[20px] font-bold text-on-background">{isWeather ? 'Crop Failure' : 'Flight Delay'} Policy</h3>
                          <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.05em] uppercase ${badgeClasses}`}>
                            {coverageStatus}
                          </span>
                        </div>
                        <p className="text-[13px] font-mono text-outline truncate max-w-[320px]">
                          Vault: {p.account.vault.toBase58().slice(0, 24)}...
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-8">
                      <div>
                        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Premiums Paid</p>
                        <p className="text-[18px] font-bold text-on-background">{formatUSDC(p.account.totalPremiumsPaid)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Coverage Until</p>
                        <p className="text-[18px] font-bold text-on-background">
                          {hasPremium ? formatDate(personalCoverageEnd) : '— Pay premium to activate'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Claims Filed</p>
                        <p className="text-[18px] font-bold text-on-background">{p.account.claimCount.toString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions + Claims toggle */}
                  <div className="mt-6 pt-6 border-t border-outline-variant flex flex-wrap gap-4 items-center">
                    <Link href={`/vaults/${p.account.vault.toBase58()}`} className="bg-primary text-on-primary px-6 py-3 rounded-full text-[14px] font-bold electric-glow hover:scale-105 transition-transform">
                      {isActive ? 'Raise a Claim' : 'View Vault'}
                    </Link>
                    <Link href={`/vaults/${p.account.vault.toBase58()}`} className="border border-outline-variant text-on-surface-variant px-6 py-3 rounded-full text-[14px] font-bold hover:border-primary/30 transition-all">
                      View Vault
                    </Link>
                    {p.claims.length > 0 && (
                      <button
                        onClick={() => toggle(p.publicKey)}
                        className="ml-auto flex items-center gap-2 text-[13px] font-bold text-primary hover:underline"
                      >
                        {showClaims ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showClaims ? 'Hide' : 'Show'} Claim History ({p.claims.length})
                      </button>
                    )}
                  </div>

                  {/* Claim history */}
                  {showClaims && p.claims.length > 0 && (
                    <div className="mt-6 space-y-3">
                      {p.claims.map(({ key, account: c }) => {
                        const { label, variant } = claimStatusLabel(c.status);
                        const statusClasses = {
                          pending:  'bg-amber-100 text-amber-700',
                          approved: 'bg-green-100 text-green-700',
                          rejected: 'bg-red-100 text-red-700',
                        }[variant];
                        return (
                          <div key={key} className="bg-surface-container-low rounded-[10px] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="text-[12px] font-bold text-outline">#{c.claimNumber.toString()}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${statusClasses}`}>{label}</span>
                              <span className="text-[13px] text-on-background">{claimDataSummary(c.claimData)}</span>
                            </div>
                            <div className="text-right text-[12px] text-on-surface-variant">
                              <div>Filed {formatDate(c.filedAt.toNumber())}</div>
                              {variant === 'approved' && (
                                <div className="text-green-700 font-semibold">Paid out {formatUSDC(c.payoutAmount)}</div>
                              )}
                              {variant === 'pending' && (
                                <div className="text-amber-600">Awaiting oracle settlement</div>
                              )}
                              {variant === 'rejected' && (
                                <div className="text-red-600">Rejected by oracle</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
