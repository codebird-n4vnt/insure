'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CloudRain, Plane, Search, SlidersHorizontal, RefreshCw } from 'lucide-react';
import {
  PHASE_LABEL, formatUSDC, formatUSDCompact, regionLabel, relativeTime, triggerDescription, vaultCapacity, vaultPhase,
  type VaultAccount, type VaultPhase,
} from '@/lib/anchor';
import { loadVaults } from '@/lib/data';
import { useProgram } from '@/lib/useProgram';
import { useChainNow } from '@/lib/useChainNow';
import { CardSkeleton } from '@/components/ui/Skeleton';

type Entry = { publicKey: string; account: VaultAccount };
type TypeFilter = 'All' | 'Weather' | 'FlightDelay';
type StatusFilter = 'open' | 'upcoming' | 'active' | 'all';
type Sort = 'newest' | 'payout' | 'premium' | 'capacity' | 'closing';

const PHASE_STYLE: Record<VaultPhase, string> = {
  open: 'bg-green-100 text-green-800',
  upcoming: 'bg-secondary-container text-on-secondary-container',
  covering: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  settling: 'bg-amber-100 text-amber-800',
  closed: 'bg-surface-container text-on-surface-variant',
};

function VaultsInner() {
  const program = useProgram();
  const router = useRouter();
  const params = useSearchParams();

  const [vaults, setVaults] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const now = useChainNow(30_000);

  const type = (params.get('type') as TypeFilter) || 'All';
  const status = (params.get('status') as StatusFilter) || 'open';
  const sort = (params.get('sort') as Sort) || 'newest';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.replace(`/vaults?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    let alive = true;
    loadVaults(program)
      .then((rows) => {
        if (!alive) return;
        setVaults(rows.map((v) => ({ publicKey: v.publicKey.toBase58(), account: v.account })));
        setError('');
      })
      .catch((e) => alive && setError(e?.message ?? 'Could not load vaults'));
    return () => {
      alive = false;
    };
  }, [program, reload]);

  const filtered = useMemo(() => {
    if (!vaults) return [];
    const q = search.trim().toLowerCase();
    const list = vaults.filter(({ publicKey, account: v }) => {
      const phase = vaultPhase(v, now);
      const matchesType = type === 'All' || ('weather' in v.triggerType ? 'Weather' : 'FlightDelay') === type;
      const matchesStatus =
        status === 'all' ||
        (status === 'open' && phase === 'open' && !v.isPaused) ||
        (status === 'upcoming' && phase === 'upcoming') ||
        (status === 'active' && (phase === 'covering' || phase === 'settling'));
      const matchesSearch = !q || publicKey.toLowerCase().includes(q) || v.authority.toBase58().toLowerCase().includes(q);
      return matchesType && matchesStatus && matchesSearch;
    });
    const by: Record<Sort, (a: Entry, b: Entry) => number> = {
      newest: (a, b) => b.account.subscriptionStart.cmp(a.account.subscriptionStart),
      payout: (a, b) => b.account.coverageAmount.cmp(a.account.coverageAmount),
      premium: (a, b) => a.account.premiumAmount.cmp(b.account.premiumAmount),
      capacity: (a, b) => vaultCapacity(b.account) - vaultCapacity(a.account),
      closing: (a, b) => a.account.subscriptionEnd.cmp(b.account.subscriptionEnd),
    };
    return list.sort(by[sort]);
  }, [vaults, search, type, status, sort, now]);

  const counts = useMemo(() => {
    const c = { open: 0, upcoming: 0, active: 0, all: vaults?.length ?? 0 };
    vaults?.forEach(({ account: v }) => {
      const p = vaultPhase(v, now);
      if (p === 'open' && !v.isPaused) c.open++;
      if (p === 'upcoming') c.upcoming++;
      if (p === 'covering' || p === 'settling') c.active++;
    });
    return c;
  }, [vaults, now]);

  const pill = (active: boolean) =>
    `px-4 py-2.5 rounded-full text-[12px] font-bold tracking-[0.06em] uppercase transition-all whitespace-nowrap ${
      active ? 'bg-primary text-on-primary electric-glow' : 'bg-surface-container-lowest border border-outline-variant text-on-surface-variant hover:border-primary/30'
    }`;

  return (
    <div className="min-h-screen px-6 md:px-8 py-10">
      <div className="max-w-[1280px] mx-auto">
        <div className="mb-10">
          <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary mb-2">Marketplace</p>
          <h1 className="text-[40px] md:text-[56px] font-extrabold text-on-background mb-3 tracking-tight">Insurance vaults</h1>
          <p className="text-[17px] text-on-surface-variant max-w-2xl">Each vault is a pool of USDC with one published rule. Buy cover from any vault that&apos;s open.</p>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Vault status">
            {([
              ['open', 'Open now'],
              ['upcoming', 'Opening soon'],
              ['active', 'Coverage live'],
              ['all', 'All'],
            ] as [StatusFilter, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={status === k} onClick={() => setParam('status', k)} className={pill(status === k)}>
                {label} {vaults ? <span className="opacity-70">· {counts[k]}</span> : null}
              </button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
              <input
                type="search"
                placeholder="Search by vault or creator address…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-14 pr-4 py-3.5 rounded-full border border-outline-variant bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {(['All', 'Weather', 'FlightDelay'] as TypeFilter[]).map((f) => (
                <button key={f} onClick={() => setParam('type', f)} className={pill(type === f)}>
                  {f === 'All' ? 'All types' : f === 'Weather' ? 'Drought' : 'Flight'}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setParam('sort', e.target.value)}
              aria-label="Sort vaults"
              className="px-5 py-3 rounded-full border border-outline-variant bg-surface-container-lowest text-[14px] font-semibold text-on-background"
            >
              <option value="newest">Newest</option>
              <option value="closing">Closing soonest</option>
              <option value="payout">Biggest payout</option>
              <option value="premium">Cheapest premium</option>
              <option value="capacity">Most capacity</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="text-center py-24 bg-surface-container-lowest/80 rounded-[16px] border border-white/50">
            <p className="text-on-background font-bold mb-2">Couldn&apos;t load vaults</p>
            <p className="text-on-surface-variant mb-6 text-[14px]">{error}</p>
            <button onClick={() => { setError(''); setVaults(null); setReload((r) => r + 1); }} className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-bold">
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </div>
        ) : vaults === null ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {[0, 1, 2].map((i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 bg-surface-container-lowest/80 backdrop-blur-md rounded-[16px] floating-shadow border border-white/50">
            <SlidersHorizontal className="w-14 h-14 text-outline mx-auto mb-5" />
            <h3 className="text-[22px] font-bold text-on-background mb-2">
              {vaults.length === 0 ? 'No vaults yet' : 'Nothing matches these filters'}
            </h3>
            <p className="text-on-surface-variant mb-8">
              {vaults.length === 0 ? 'Be the first underwriter on the protocol.' : 'Try “All” or a different type.'}
            </p>
            <div className="flex gap-3 justify-center">
              {vaults.length > 0 && status !== 'all' && (
                <button onClick={() => setParam('status', 'all')} className="px-6 py-3 rounded-full border border-outline-variant font-bold">Show all vaults</button>
              )}
              <Link href="/creator" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-full font-bold electric-glow">
                Create a vault
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8" data-testid="vault-grid">
            {filtered.map(({ publicKey, account: v }) => {
              const isWeather = 'weather' in v.triggerType;
              const phase = vaultPhase(v, now);
              const committed = v.activePolicies.mul(v.coverageAmount);
              const usedPct = v.totalLiquidity.isZero() ? 100 : Math.min(100, Math.round((Number(committed.toString()) / Number(v.totalLiquidity.toString())) * 100));
              const capacity = vaultCapacity(v);
              const timing =
                phase === 'upcoming' ? `Opens ${relativeTime(v.subscriptionStart.toNumber(), now)}`
                : phase === 'open' ? `Sales close ${relativeTime(v.subscriptionEnd.toNumber(), now)}`
                : phase === 'covering' ? `Coverage ends ${relativeTime(v.coverageEnd.toNumber(), now)}`
                : phase === 'settling' ? `Expires ${relativeTime(v.vaultExpiry.toNumber(), now)}`
                : 'Closed';
              return (
                <Link
                  key={publicKey}
                  href={`/vaults/${publicKey}`}
                  className="flex flex-col bg-surface-container-lowest/85 backdrop-blur-md rounded-[16px] floating-shadow border border-white/60 p-7 hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-bold ${isWeather ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-fixed text-on-tertiary-fixed-variant'}`}>
                      {isWeather ? <CloudRain className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
                      {isWeather ? 'Drought' : 'Flight delay'}
                    </span>
                    <span className={`px-3 py-1.5 rounded-full text-[11px] font-bold ${PHASE_STYLE[phase]}`}>
                      {v.isPaused && phase === 'open' ? 'Paused' : PHASE_LABEL[phase]}
                    </span>
                  </div>
                  <p className="text-[16px] font-bold text-on-background mb-1">{triggerDescription(v)}</p>
                  <p className="text-[13px] text-on-surface-variant mb-5">{isWeather ? `Region ${regionLabel(v.region)}` : 'Any flight, any airline'}</p>
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-1">Payout</p>
                      <p className="text-[20px] font-bold text-primary">{formatUSDC(v.coverageAmount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-1">Premium</p>
                      <p className="text-[20px] font-bold text-on-background">{formatUSDC(v.premiumAmount)}<span className="text-[12px] text-on-surface-variant">{isWeather ? '/mo' : ''}</span></p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-1">Liquidity</p>
                      <p className="text-[20px] font-bold text-on-background">{formatUSDCompact(v.totalLiquidity)}</p>
                    </div>
                  </div>
                  <div className="mb-5">
                    <div className="flex justify-between text-[12px] text-on-surface-variant mb-1.5">
                      <span>{v.activePolicies.toString()} active polic{v.activePolicies.eqn(1) ? 'y' : 'ies'}</span>
                      <span>{capacity} more available</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary-container overflow-hidden" role="meter" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100} aria-label="Capacity used">
                      <div className={`h-full rounded-full ${usedPct >= 90 ? 'bg-amber-600' : 'bg-primary'}`} style={{ width: `${usedPct}%` }} />
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between text-[13px]">
                    <span className="text-on-surface-variant">{timing}</span>
                    <span className="text-primary font-bold group-hover:translate-x-1 transition-transform">View →</span>
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

export default function VaultsPage() {
  return (
    <Suspense fallback={null}>
      <VaultsInner />
    </Suspense>
  );
}
