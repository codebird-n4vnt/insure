'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Shield, CloudRain, Plane, Loader2 } from 'lucide-react';
import { getProgram, formatUSDC, formatDate, triggerTypeLabel } from '@/lib/anchor';

type PolicyEntry = { publicKey: string; account: any; vaultAccount: any };

export default function MyInsurancePage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
        const userPolicies = await program.account.policyHolder.all([
          { memcmp: { offset: 8 + 32, bytes: publicKey!.toBase58() } },
        ]);
        const withVaults = await Promise.all(
          userPolicies.map(async (p) => {
            try {
              const vaultAccount = await program.account.vault.fetch(p.account.vault);
              return { publicKey: p.publicKey.toBase58(), account: p.account, vaultAccount };
            } catch { return null; }
          })
        );
        setPolicies(withVaults.filter(Boolean) as PolicyEntry[]);
      } catch (err) {
        console.error('Failed to load policies:', err);
      }
      setLoading(false);
    }
    load();
  }, [publicKey, connection]);

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
              const coverageEnd = p.account.personalCoverageEnd.toNumber();
              const isActive = coverageEnd > now && p.account.isSubscribed;

              return (
                <div key={p.publicKey} className="bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50 p-[32px]">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-start gap-6">
                      <div className={`p-4 rounded-[12px] flex-shrink-0 ${isWeather ? 'bg-secondary-container' : 'bg-tertiary-container/40'}`}>
                        {isWeather ? <CloudRain className="w-8 h-8 text-on-secondary-container" /> : <Plane className="w-8 h-8 text-on-tertiary-container" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-[20px] font-bold text-on-background">{isWeather ? 'Crop Failure' : 'Flight Delay'} Policy</h3>
                          <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.05em] uppercase ${isActive ? 'bg-green-100 text-green-700' : 'bg-surface-container text-on-surface-variant'}`}>
                            {isActive ? 'Active' : 'Expired'}
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
                        <p className="text-[18px] font-bold text-on-background">{formatDate(coverageEnd)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Claims Filed</p>
                        <p className="text-[18px] font-bold text-on-background">{p.account.claimCount.toString()}</p>
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <div className="mt-6 pt-6 border-t border-outline-variant flex gap-4">
                      <Link href={`/vaults/${p.account.vault.toBase58()}`} className="bg-primary text-on-primary px-6 py-3 rounded-full text-[14px] font-bold electric-glow hover:scale-105 transition-transform">
                        Raise a Claim
                      </Link>
                      <Link href={`/vaults/${p.account.vault.toBase58()}`} className="border border-outline-variant text-on-surface-variant px-6 py-3 rounded-full text-[14px] font-bold hover:border-primary/30 transition-all">
                        View Vault
                      </Link>
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
