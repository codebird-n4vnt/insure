'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useProgram } from '@/lib/useProgram';
import { loadRecentClaims, loadStats, type ProtocolStats, type Row } from '@/lib/data';
import { claimStatusLabel, claimUrl, formatUSDC, formatUSDCompact, observedLabel, relativeTime, riskSummary, type ClaimAccount } from '@/lib/anchor';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChainNow } from '@/lib/useChainNow';

export function LiveStats({ variant }: { variant: 'hero' | 'band' }) {
  const program = useProgram();
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadStats(program).then(setStats).catch(() => setFailed(true));
  }, [program]);

  const items = [
    { label: 'Liquidity backing cover', value: stats ? formatUSDCompact(stats.totalLiquidity) : null },
    { label: 'Active policies', value: stats ? stats.activePolicies.toLocaleString() : null },
    { label: 'Paid out to policyholders', value: stats ? formatUSDCompact(stats.claimsPaid) : null },
    { label: 'Vaults open for cover', value: stats ? String(stats.openVaults) : null },
  ];

  if (variant === 'band') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-10 relative z-10" data-testid="live-stats">
        {items.map((i) => (
          <div key={i.label} className="flex flex-col items-center text-center">
            {i.value === null ? (
              failed ? <span className="text-[40px] font-black">—</span> : <Skeleton className="h-12 w-28 mb-2 opacity-30" />
            ) : (
              <span className="text-[40px] md:text-[52px] font-black leading-none mb-2">{i.value}</span>
            )}
            <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-white/70">{i.label}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-6" data-testid="live-stats-hero">
      {items.slice(0, 4).map((i) => (
        <div key={i.label}>
          <p className="text-[11px] font-bold tracking-[0.1em] text-on-surface-variant uppercase mb-1">{i.label}</p>
          {i.value === null ? (
            failed ? <p className="text-[28px] font-bold text-on-background">—</p> : <Skeleton className="h-8 w-24" />
          ) : (
            <p className="text-[28px] font-bold text-on-background">{i.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

const STATUS_ICON = {
  approved: <CheckCircle2 className="w-5 h-5 text-green-700" />,
  rejected: <XCircle className="w-5 h-5 text-on-surface-variant" />,
  pending: <Clock className="w-5 h-5 text-amber-700" />,
};

export function RecentClaims() {
  const program = useProgram();
  const [rows, setRows] = useState<Row<ClaimAccount>[] | null>(null);
  const now = useChainNow(60_000);

  useEffect(() => {
    loadRecentClaims(program, 6).then(setRows).catch(() => setRows([]));
  }, [program]);

  if (rows === null) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-[14px]" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-outline-variant p-8 text-center text-on-surface-variant">
        No claims yet. When the first one is settled, its data and verdict appear here.
      </div>
    );
  }
  return (
    <ul className="space-y-3" data-testid="recent-claims">
      {rows.map(({ publicKey, account }) => {
        const { label, variant } = claimStatusLabel(account.status);
        const when = variant === 'pending' ? account.filedAt.toNumber() : account.settledAt.toNumber();
        return (
          <li key={publicKey.toBase58()}>
            <Link
              href={claimUrl(publicKey.toBase58())}
              className="flex items-center gap-4 rounded-[14px] bg-surface-container-lowest border border-outline-variant px-5 py-4 hover:border-primary/40 transition-colors group"
            >
              {STATUS_ICON[variant]}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-on-background truncate">{riskSummary(account.risk)}</p>
                <p className="text-[12px] text-on-surface-variant truncate">
                  {label}
                  {variant === 'approved' ? ` · ${formatUSDC(account.payoutAmount)} paid` : ''}
                  {observedLabel(account) ? ` · ${observedLabel(account)}` : ''} · {relativeTime(when, now)}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-outline group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
