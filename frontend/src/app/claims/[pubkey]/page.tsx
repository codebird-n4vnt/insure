'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Copy, Download, ExternalLink, FileCheck2, ShieldAlert, XCircle } from 'lucide-react';
import {
  BACKEND_URL, claimStatusLabel, evidenceUrl, explorerAddress, formatDate, formatUSDC, observedLabel, riskSummary,
  type ClaimAccount, type VaultAccount,
} from '@/lib/anchor';
import { useProgram } from '@/lib/useProgram';
import { CumulativeRainChart } from '@/components/charts/charts';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

interface Evidence {
  decision: 'approve' | 'reject';
  summary: string;
  explanation?: string | null;
  observedValue: number;
  decidedAt: string;
  oracle: string;
  rule: { type: string; thresholdMm?: number; observationDays?: number; thresholdMinutes?: number };
  data: {
    source?: string;
    url?: string;
    totalMm?: number;
    daily?: { date: string; mm: number | null }[];
    record?: {
      source: string; flightIata: string; flightDate: string; status: string;
      departureDelayMinutes: number | null; arrivalDelayMinutes: number | null; extractedBy: string;
    };
    providerUrl?: string;
  };
}

type Verify = { state: 'loading' } | { state: 'missing' } | { state: 'match'; hash: string } | { state: 'mismatch'; hash: string };

const toHex = (b: ArrayBuffer | Uint8Array | number[]) => Array.from(new Uint8Array(b as ArrayBuffer)).map((x) => x.toString(16).padStart(2, '0')).join('');

export default function ClaimPage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const { connection } = useConnection();
  const program = useProgram();
  const toast = useToast();
  const key = useMemo(() => { try { return new PublicKey(pubkey); } catch { return null; } }, [pubkey]);

  const [claim, setClaim] = useState<ClaimAccount | null>(null);
  const [vault, setVault] = useState<VaultAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [raw, setRaw] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [verify, setVerify] = useState<Verify>({ state: 'loading' });

  const [tick, setTick] = useState(0);
  const load = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    (async () => {
      const c = await program.account.claim.fetchNullable(key).catch(() => null);
      const v = c ? await program.account.vault.fetchNullable(c.vault).catch(() => null) : null;
      if (!alive) return;
      setClaim(c);
      setVault(v);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [program, key, tick]);

  // Live update while pending.
  const pending = !!claim && 'pending' in claim.status;
  useEffect(() => {
    if (!key || !pending) return;
    const id = connection.onAccountChange(key, () => load(), 'confirmed');
    return () => void connection.removeAccountChangeListener(id).catch(() => {});
  }, [connection, key, pending, load]);

  // Fetch the evidence bytes and hash them exactly as served.
  useEffect(() => {
    if (!claim || pending || !key) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(evidenceUrl(key.toBase58()), { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error('missing');
        const text = await res.text();
        const digest = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
        if (!alive) return;
        setRaw(text);
        setEvidence(JSON.parse(text));
        setVerify({ state: digest === toHex(claim.evidenceHash) ? 'match' : 'mismatch', hash: digest });
      } catch {
        if (alive) setVerify({ state: 'missing' });
      }
    })();
    return () => { alive = false; };
  }, [claim, pending, key]);

  if (!loaded && key) {
    return <div className="px-6 md:px-8 py-10 max-w-[1000px] mx-auto"><Skeleton className="h-56 rounded-[18px] mb-6" /><Skeleton className="h-72 rounded-[18px]" /></div>;
  }
  if (!claim || !key) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-center px-8">
        <div>
          <AlertTriangle className="w-14 h-14 text-error mx-auto mb-4" />
          <h1 className="text-[24px] font-bold text-on-background mb-2">Claim not found</h1>
          <Link href="/vaults" className="text-primary font-bold hover:underline">Browse vaults</Link>
        </div>
      </div>
    );
  }

  const { label, variant } = claimStatusLabel(claim.status);
  const onChainHash = toHex(claim.evidenceHash);
  const isWeather = 'weather' in claim.risk;
  const card = 'bg-surface-container-lowest/85 backdrop-blur-md rounded-[18px] p-6 md:p-8 floating-shadow border border-white/60 mb-6';
  const dailyComplete = evidence?.data.daily?.every((d) => d.mm !== null) ? (evidence.data.daily as { date: string; mm: number }[]) : null;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.show({ kind: 'success', title: 'Copied' }); } catch { /* ignore */ }
  };

  return (
    <div className="px-6 md:px-8 py-10 max-w-[1000px] mx-auto">
      <Link href={`/vaults/${claim.vault.toBase58()}`} className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary mb-6 text-[14px] font-bold">
        <ArrowLeft className="w-4 h-4" /> Back to vault
      </Link>

      {/* Verdict */}
      <div className={`rounded-[18px] p-8 md:p-10 mb-6 text-white ${variant === 'approved' ? 'bg-primary' : variant === 'pending' ? 'bg-on-background' : 'bg-secondary'}`}>
        <div className="flex items-center gap-3 mb-4">
          {variant === 'approved' ? <CheckCircle2 className="w-8 h-8" /> : variant === 'pending' ? <Clock className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          <span className="text-[13px] font-bold uppercase tracking-[0.1em]" data-testid="claim-verdict">{label}</span>
        </div>
        <h1 className="text-[28px] md:text-[38px] font-bold leading-tight mb-3">
          {variant === 'approved'
            ? `${formatUSDC(claim.payoutAmount)} paid out`
            : variant === 'pending'
              ? 'The oracle is checking the data'
              : 'Trigger not met — no payout'}
        </h1>
        <p className="text-white/80 text-[16px]">{riskSummary(claim.risk)} · Claim #{claim.claimNumber.toString()} · filed {formatDate(claim.filedAt.toNumber(), true)}</p>
        {evidence?.summary && <p className="text-white text-[17px] mt-4 font-semibold">{evidence.summary}</p>}
        {evidence?.explanation && <p className="text-white/85 text-[15px] mt-2">{evidence.explanation}</p>}
        {variant === 'pending' && (
          <p className="text-white/80 text-[15px] mt-4">
            This page updates live. Weather claims usually settle within a couple of minutes; flight claims wait until landing data is published.
          </p>
        )}
      </div>

      {variant !== 'pending' && (
        <>
          {/* Integrity */}
          <section className={card} aria-labelledby="integrity">
            <h2 id="integrity" className="text-[20px] font-bold text-on-background mb-4 flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-primary" /> Evidence integrity
            </h2>
            {verify.state === 'loading' && <Skeleton className="h-16" />}
            {verify.state === 'match' && (
              <div className="rounded-[12px] bg-green-50 border border-green-200 p-4 text-green-900" data-testid="hash-match">
                <p className="font-bold flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Verified in your browser</p>
                <p className="text-[14px] mt-1">The evidence below hashes to exactly the value the oracle wrote on-chain, so it hasn&apos;t been altered since settlement.</p>
              </div>
            )}
            {verify.state === 'mismatch' && (
              <div className="rounded-[12px] bg-error-container border border-error/30 p-4 text-on-error-container" data-testid="hash-mismatch">
                <p className="font-bold flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> Hash mismatch</p>
                <p className="text-[14px] mt-1">The evidence served now does not match the on-chain hash. Treat it as untrustworthy.</p>
              </div>
            )}
            {verify.state === 'missing' && (
              <div className="rounded-[12px] bg-amber-50 border border-amber-200 p-4 text-amber-900">
                <p className="font-bold">Evidence bundle not available</p>
                <p className="text-[14px] mt-1">The oracle API didn&apos;t return it. The on-chain hash below still commits to its exact contents.</p>
              </div>
            )}
            <dl className="mt-4 grid gap-3 text-[13px]">
              <div>
                <dt className="font-bold text-on-surface-variant uppercase tracking-[0.06em] text-[11px]">On-chain hash</dt>
                <dd className="font-mono break-all text-on-background">{onChainHash}</dd>
              </div>
              {'hash' in verify && (
                <div>
                  <dt className="font-bold text-on-surface-variant uppercase tracking-[0.06em] text-[11px]">SHA-256 of downloaded evidence</dt>
                  <dd className="font-mono break-all text-on-background">{verify.hash}</dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
              <button onClick={() => copy(`curl -s ${evidenceUrl(key.toBase58())} | sha256sum`)} className="inline-flex items-center gap-1.5 font-bold text-primary"><Copy className="w-4 h-4" /> Copy verify command</button>
              {raw && (
                <a href={`data:application/json;charset=utf-8,${encodeURIComponent(raw)}`} download={`evidence-${key.toBase58()}.json`} className="inline-flex items-center gap-1.5 font-bold text-primary">
                  <Download className="w-4 h-4" /> Download evidence
                </a>
              )}
              <a href={explorerAddress(key.toBase58())} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-primary">
                <ExternalLink className="w-4 h-4" /> Claim account on Explorer
              </a>
            </div>
          </section>

          {/* The data */}
          <section className={card} aria-labelledby="data">
            <h2 id="data" className="text-[20px] font-bold text-on-background mb-1">The data behind the decision</h2>
            <p className="text-[14px] text-on-surface-variant mb-5">
              {observedLabel(claim)}
              {vault && isWeather ? ` · threshold ${vault.triggerThreshold.toString()} mm over ${vault.observationDays} day${vault.observationDays === 1 ? '' : 's'}` : ''}
              {vault && !isWeather ? ` · threshold ${vault.triggerThreshold.toString()} min` : ''}
            </p>

            {isWeather && dailyComplete && evidence?.rule.thresholdMm !== undefined && (
              <CumulativeRainChart days={dailyComplete} threshold={evidence.rule.thresholdMm} />
            )}

            {!isWeather && evidence?.data.record && (
              <table className="w-full text-[14px]">
                <tbody>
                  {[
                    ['Flight', `${evidence.data.record.flightIata} on ${evidence.data.record.flightDate}`],
                    ['Status', evidence.data.record.status],
                    ['Departure delay', evidence.data.record.departureDelayMinutes === null ? '—' : `${evidence.data.record.departureDelayMinutes} min`],
                    ['Arrival delay', evidence.data.record.arrivalDelayMinutes === null ? '—' : `${evidence.data.record.arrivalDelayMinutes} min`],
                    ['Source', evidence.data.record.source],
                    ['Read by', evidence.data.record.extractedBy === 'gemini' ? 'AI extraction (checked against flight number & date)' : 'Deterministic parser'],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-outline-variant"><th className="text-left py-2 pr-4 text-on-surface-variant font-semibold w-44">{k}</th><td className="py-2 text-on-background">{v}</td></tr>
                  ))}
                </tbody>
              </table>
            )}

            {evidence && (
              <dl className="mt-5 grid sm:grid-cols-2 gap-3 text-[13px]">
                {evidence.data.source && <div><dt className="text-on-surface-variant font-semibold">Data source</dt><dd className="text-on-background">{evidence.data.source}</dd></div>}
                <div><dt className="text-on-surface-variant font-semibold">Decided</dt><dd className="text-on-background">{new Date(evidence.decidedAt).toLocaleString()}</dd></div>
                <div className="sm:col-span-2"><dt className="text-on-surface-variant font-semibold">Oracle</dt><dd className="font-mono text-on-background break-all">{evidence.oracle}</dd></div>
                {(evidence.data.url || evidence.data.providerUrl) && (
                  <div className="sm:col-span-2">
                    <dt className="text-on-surface-variant font-semibold">Re-fetch the source yourself</dt>
                    <dd className="break-all"><a className="text-primary underline" href={evidence.data.url ?? evidence.data.providerUrl} target="_blank" rel="noopener noreferrer">{evidence.data.url ?? evidence.data.providerUrl}</a></dd>
                  </div>
                )}
              </dl>
            )}

            {raw && (
              <details className="mt-6">
                <summary className="cursor-pointer text-[14px] font-bold text-primary">Raw evidence JSON</summary>
                <pre className="mt-3 bg-on-background text-white rounded-[12px] p-4 text-[12px] overflow-auto max-h-96">{JSON.stringify(JSON.parse(raw), null, 2)}</pre>
              </details>
            )}
          </section>
        </>
      )}

      <p className="text-[13px] text-on-surface-variant">
        Evidence is served by the oracle at <span className="font-mono">{BACKEND_URL}/evidence/…</span>. Learn how verification works in{' '}
        <Link href="/how-it-works#verify" className="text-primary underline">How it works</Link>.
      </p>
    </div>
  );
}
