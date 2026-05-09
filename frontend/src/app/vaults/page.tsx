'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { CloudRain, Plane, Search, SlidersHorizontal, Loader2 } from 'lucide-react';
import { getProgram, formatUSDC, formatDate, triggerTypeLabel } from '@/lib/anchor';

type VaultEntry = { publicKey: string; account: any };

export default function VaultsPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();

  const [vaults, setVaults] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Weather' | 'FlightDelay'>('All');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const dummyWallet = {
          publicKey: new PublicKey('11111111111111111111111111111111'),
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        };
        const provider = new AnchorProvider(
          connection,
          publicKey ? { publicKey, signTransaction: signTransaction!, signAllTransactions: signAllTransactions! } : dummyWallet as any,
          { commitment: 'confirmed' }
        );
        const program = getProgram(provider);
        const allVaults = await program.account.vault.all();
        setVaults(allVaults.map((v) => ({ publicKey: v.publicKey.toBase58(), account: v.account })));
      } catch (err) {
        console.error('Failed to load vaults:', err);
      }
      setLoading(false);
    }
    load();
  }, [connection, publicKey]);

  const filtered = vaults.filter((v) => {
    const type = triggerTypeLabel(v.account.triggerType);
    const matchesType = filter === 'All' || type === filter;
    const matchesSearch = !search || v.publicKey.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch && !v.account.isPaused;
  });

  return (
    <div className="min-h-screen px-8 py-24">
      <div className="max-w-[1280px] mx-auto">
        <div className="mb-12">
          <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary mb-2">On-Chain Markets</p>
          <h1 className="text-[48px] md:text-[64px] font-extrabold text-on-background mb-4 tracking-tight">Vault Browser</h1>
          <p className="text-[18px] text-on-surface-variant max-w-2xl">Browse all active parametric insurance vaults. Subscribe to receive coverage.</p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-10">
          <div className="flex-1 relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
            <input type="text" placeholder="Search by vault address…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-14 pr-4 py-4 rounded-full border border-outline-variant bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-on-background" />
          </div>
          <div className="flex gap-2">
            {(['All', 'Weather', 'FlightDelay'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-6 py-4 rounded-full text-[12px] font-bold tracking-[0.1em] uppercase transition-all ${
                  filter === f ? 'bg-primary text-on-primary electric-glow' : 'bg-surface-container-lowest border border-outline-variant text-on-surface-variant hover:border-primary/30'
                }`}
              >
                {f === 'All' ? 'All' : f === 'Weather' ? 'Crop Failure' : 'Flight Delay'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-40">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-40 bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50">
            <SlidersHorizontal className="w-16 h-16 text-outline mx-auto mb-6" />
            <h3 className="text-[24px] font-bold text-on-background mb-2">No Vaults Found</h3>
            <p className="text-on-surface-variant mb-8">
              {vaults.length === 0 ? 'No vaults deployed yet. Be the first to create one!' : 'Try a different filter.'}
            </p>
            <Link href="/creator" className="inline-flex items-center gap-2 bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow hover:scale-105 transition-transform">
              Create First Vault
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {filtered.map((vault) => {
              const type = triggerTypeLabel(vault.account.triggerType);
              const isWeather = type === 'Weather';
              return (
                <Link key={vault.publicKey} href={`/vaults/${vault.publicKey}`}
                  className="block bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50 p-[32px] hover:-translate-y-2 transition-all duration-300 group">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 text-[12px] font-bold tracking-[0.1em] uppercase ${
                    isWeather ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-container/40 text-on-tertiary-container'
                  }`}>
                    {isWeather ? <CloudRain className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
                    {isWeather ? 'Crop Failure' : 'Flight Delay'}
                  </div>
                  <p className="text-[11px] font-mono text-outline mb-4 truncate">
                    {vault.publicKey.slice(0, 20)}...{vault.publicKey.slice(-8)}
                  </p>
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">TVL</p>
                      <p className="text-[20px] font-bold text-primary">{formatUSDC(vault.account.totalLiquidity)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Coverage</p>
                      <p className="text-[20px] font-bold text-on-background">{formatUSDC(vault.account.coverageAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Premium</p>
                      <p className="text-[18px] font-bold text-on-background">{formatUSDC(vault.account.premiumAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-outline mb-1">Policies</p>
                      <p className="text-[18px] font-bold text-on-background">{vault.account.totalPolicies.toString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-on-surface-variant">Ends {formatDate(vault.account.coverageEnd.toNumber())}</span>
                    <span className="text-primary font-bold group-hover:translate-x-1 transition-transform inline-block">View Details →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
