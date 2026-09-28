'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { BN } from '@coral-xyz/anchor';
import { Shield, CloudRain, Plane, ChevronDown, ChevronUp } from 'lucide-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  claimPDA, claimStatusLabel, claimUrl, formatDate, formatUSDC, observedLabel, riskSummary, triggerTypeLabel,
  type ClaimAccount, type PolicyAccount, type VaultAccount,
} from '@/lib/anchor';
import { loadPolicies } from '@/lib/data';
import { useProgram } from '@/lib/useProgram';
import { useChainNow } from '@/lib/useChainNow';
import { CardSkeleton } from '@/components/ui/Skeleton';

type ClaimEntry = { key: string; account: ClaimAccount };
type PolicyEntry = { publicKey: string; account: PolicyAccount; vaultAccount: VaultAccount; claims: ClaimEntry[] };

export default function MyInsurancePage() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const program = useProgram();

  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const now = useChainNow();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const userPolicies = await loadPolicies(program, publicKey);
        const vaults = await program.account.vault.fetchMultiple(userPolicies.map((p) => p.account.vault));
        const entries = await Promise.all(
          userPolicies.map(async (p, i) => {
            const vaultAccount = vaults[i];
            if (!vaultAccount) return null;
            const keys = Array.from({ length: p.account.claimCount.toNumber() }, (_, n) => claimPDA(p.account.vault, publicKey, new BN(n)));
            const accs = await program.account.claim.fetchMultiple(keys);
            const claims = accs
              .map((a, n) => (a ? { key: keys[n].toBase58(), account: a } : null))
              .filter((c): c is ClaimEntry => c !== null)
              .reverse();
            return { publicKey: p.publicKey.toBase58(), account: p.account, vaultAccount, claims };
          })
        );
        if (!cancelled) setPolicies(entries.filter((e): e is PolicyEntry => e !== null));
      } catch (err) {
        console.error('Failed to load policies:', err);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [publicKey, program]);

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!publicKey) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-8 py-10">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 bg-secondary-container rounded-full flex items-center justify-center mx-auto mb-6">
            <Shield className="w-12 h-12 text-primary" />
          </div>
          <h2 className="text-[32px] font-bold text-on-background mb-4">Connect Your Wallet</h2>
          <p className="text-[18px] text-on-surface-variant mb-8">Connect your Solana wallet to view your policies and claim history.</p>
          <button onClick={() => setVisible(true)} className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow">Connect wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 md:px-8 py-10">
      <div className="max-w-[1280px] mx-auto">
        <div className="mb-12">
          <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary mb-2">Your Portfolio</p>
          <h1 className="text-[48px] md:text-[64px] font-extrabold text-on-background mb-4 tracking-tight">My Insurance</h1>
          <p className="text-[18px] text-on-surface-variant">Your policies and automated payouts.</p>
        </div>

        {loading ? (
          <div className="space-y-6"><CardSkeleton /><CardSkeleton /></div>
        ) : policies.length === 0 ? (
          <div className="text-center py-40 bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50">
            <Shield className="w-16 h-16 text-outline mx-auto mb-6" />
            <h3 className="text-[24px] font-bold text-on-background mb-2">No Policies Yet</h3>
            <p className="text-on-surface-variant mb-8">You haven&apos;t bought any insurance yet.</p>
            <Link href="/vaults" className="inline-flex items-center gap-2 bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow hover:scale-105 transition-transform">
              Browse Vaults
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {policies.map((p) => {
              const isWeather = triggerTypeLabel(p.vaultAccount.triggerType) === 'Weather';
              const end = p.account.personalCoverageEnd.toNumber();
              const status = p.account.paidOut ? 'Paid out'
                : p.account.released ? 'Expired'
                : p.account.hasPendingClaim ? 'Claim pending'
                : now < p.vaultAccount.coverageStart.toNumber() ? 'Starts soon'
                : now <= end ? 'Active' : 'Lapsed';
              const badge = {
                'Paid out': 'bg-green-100 text-green-700',
                'Claim pending': 'bg-amber-100 text-amber-700',
                'Starts soon': 'bg-secondary-container text-on-secondary-container',
                Active: 'bg-green-100 text-green-700',
                Expired: 'bg-surface-container text-on-surface-variant',
                Lapsed: 'bg-surface-container text-on-surface-variant',
              }[status];
              const showClaims = expanded[p.publicKey] ?? false;
              const vault = p.account.vault.toBase58();

              return (
                <div key={p.publicKey} className="bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50 p-[32px]">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-start gap-6">
                      <div className={`p-4 rounded-[12px] flex-shrink-0 ${isWeather ? 'bg-secondary-container' : 'bg-tertiary-container/40'}`}>
                        {isWeather ? <CloudRain className="w-8 h-8 text-on-secondary-container" /> : <Plane className="w-8 h-8 text-on-tertiary-container" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-[20px] font-bold text-on-background">{isWeather ? 'Crop Drought' : 'Flight Delay'} Policy</h3>
                          <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.05em] uppercase ${badge}`}>{status}</span>
                        </div>
                        <p className="text-[14px] text-on-surface-variant">{riskSummary(p.account.risk)}</p>
                        <p className="text-[12px] font-mono text-outline truncate max-w-[320px]">Vault {vault.slice(0, 20)}…</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-8">
                      <div>
                        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Payout</p>
                        <p className="text-[18px] font-bold text-on-background">{formatUSDC(p.vaultAccount.coverageAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Covered Until</p>
                        <p className="text-[18px] font-bold text-on-background">{formatDate(end)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Premiums</p>
                        <p className="text-[18px] font-bold text-on-background">{formatUSDC(p.account.totalPremiumsPaid)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-outline-variant flex flex-wrap gap-4 items-center">
                    <Link href={`/vaults/${vault}`} className="bg-primary text-on-primary px-6 py-3 rounded-full text-[14px] font-bold electric-glow hover:scale-105 transition-transform">
                      {status === 'Active' ? 'Manage / File a claim' : 'View policy'}
                    </Link>
                    {p.claims.length > 0 && (
                      <button onClick={() => toggle(p.publicKey)} className="ml-auto flex items-center gap-2 text-[13px] font-bold text-primary hover:underline">
                        {showClaims ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showClaims ? 'Hide' : 'Show'} claims ({p.claims.length})
                      </button>
                    )}
                  </div>

                  {showClaims && (
                    <div className="mt-6 space-y-3">
                      {p.claims.map(({ key, account: c }) => {
                        const { label, variant } = claimStatusLabel(c.status);
                        const cls = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700' }[variant];
                        return (
                          <Link key={key} href={claimUrl(key)} className="bg-surface-container-low rounded-[10px] px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-container">
                            <div className="flex items-center gap-3">
                              <span className="text-[12px] font-bold text-outline">#{c.claimNumber.toString()}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${cls}`}>{label}</span>
                              <span className="text-[13px] text-on-background">{observedLabel(c) ?? 'Awaiting oracle'}</span>
                            </div>
                            <div className="text-right text-[12px] text-on-surface-variant">
                              <div>Filed {formatDate(c.filedAt.toNumber())}</div>
                              {variant === 'approved' && <div className="text-green-700 font-semibold">Paid {formatUSDC(c.payoutAmount)}</div>}
                              <div className="text-primary font-bold">Evidence →</div>
                            </div>
                          </Link>
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
