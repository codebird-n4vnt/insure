'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SystemProgram, Transaction } from '@solana/web3.js';
import { AlertCircle, ArrowRight, CheckCircle, CloudRain, Loader2, Plane, Plus, Wand2 } from 'lucide-react';
import {
  CLAIM_FILING_GRACE, DAY, MAX_CREATOR_FEE_BPS, PHASE_LABEL, USDC_MINT, configPDA, errorMessage, explorerTx, formatUSDC, formatUSDCompact,
  regionLabel, relativeTime, toUSDC, triggerDescription, usdcAta, vaultCapacity, vaultPhase, vaultPDA, vaultTreasuryPDA,
  type VaultAccount,
} from '@/lib/anchor';
import { loadVaults } from '@/lib/data';
import { useProgram } from '@/lib/useProgram';
import { useBalances } from '@/lib/useBalances';
import { useChainNow } from '@/lib/useChainNow';
import { useToast } from '@/components/ui/Toast';
import { CardSkeleton } from '@/components/ui/Skeleton';
import MapPicker from '@/components/map/MapPicker';
import BacktestPanel from '@/components/insights/BacktestPanel';

type TriggerType = 'Weather' | 'FlightDelay';
type Tab = 'create' | 'vaults';

function toLocalInput(unix: number): string {
  const d = new Date(unix * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
const toUnix = (s: string) => Math.floor(new Date(s).getTime() / 1000);

const inputCls =
  'w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background';
const labelCls = 'block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2';
const hintCls = 'text-[12px] text-on-surface-variant mt-2';
const card = 'bg-surface-container-lowest/85 backdrop-blur-md p-6 md:p-10 rounded-[18px] floating-shadow border border-white/60';

const REGION_SIZES = [
  { km: 50, label: '±50 km (a district)' },
  { km: 100, label: '±100 km' },
  { km: 250, label: '±250 km (a state)' },
  { km: 500, label: '±500 km (max)' },
];

/** A lat/lon box of ±km around a centre, clamped to the program's 10° span limit. */
function regionAround(lat: number, lon: number, km: number) {
  const dLat = Math.min(km / 111, 4.99);
  const dLon = Math.min(km / (111 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2)), 4.99);
  const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
  return {
    minLatE6: Math.round(clamp(lat - dLat, 90) * 1e6),
    maxLatE6: Math.round(clamp(lat + dLat, 90) * 1e6),
    minLonE6: Math.round(clamp(lon - dLon, 180) * 1e6),
    maxLonE6: Math.round(clamp(lon + dLon, 180) * 1e6),
  };
}

function CreatorInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { publicKey } = useWallet();
  const tab: Tab = params.get('tab') === 'vaults' ? 'vaults' : 'create';
  const setTab = (t: Tab) => router.replace(t === 'vaults' ? '/creator?tab=vaults' : '/creator', { scroll: false });

  return (
    <div className="px-6 md:px-8 py-10">
      <div className="max-w-[1100px] mx-auto">
        <div className="mb-8">
          <p className="text-[12px] font-bold tracking-[0.1em] uppercase text-primary mb-2">Underwriters</p>
          <h1 className="text-[40px] md:text-[56px] font-extrabold text-on-background mb-3 tracking-tight">Underwrite risk, earn premiums</h1>
          <p className="text-[17px] text-on-surface-variant max-w-2xl">
            Fund a vault with USDC, publish a rule, and earn a fee on every premium. Every policy you sell is fully collateralised.
          </p>
        </div>
        <div className="flex gap-2 mb-8" role="tablist">
          {([['vaults', 'My vaults'], ['create', 'Create a vault']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 rounded-full text-[13px] font-bold ${tab === t ? 'bg-primary text-on-primary electric-glow' : 'bg-surface-container-lowest border border-outline-variant text-on-surface-variant'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'vaults' ? <MyVaults onCreate={() => setTab('create')} connected={!!publicKey} /> : <CreateVault />}
      </div>
    </div>
  );
}

function MyVaults({ onCreate, connected }: { onCreate: () => void; connected: boolean }) {
  const program = useProgram();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [vaults, setVaults] = useState<{ key: string; account: VaultAccount }[] | null>(null);
  const now = useChainNow();

  useEffect(() => {
    if (!publicKey) return;
    let alive = true;
    loadVaults(program, publicKey)
      .then((rows) => alive && setVaults(rows.map((r) => ({ key: r.publicKey.toBase58(), account: r.account })).sort((a, b) => b.account.vaultId.cmp(a.account.vaultId))))
      .catch(() => alive && setVaults([]));
    return () => { alive = false; };
  }, [program, publicKey]);

  if (!connected) {
    return (
      <div className={`${card} text-center`}>
        <p className="text-on-surface-variant mb-6">Connect the wallet you underwrite with to see your vaults.</p>
        <button onClick={() => setVisible(true)} className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow">Connect wallet</button>
      </div>
    );
  }
  if (vaults === null) return <div className="grid md:grid-cols-2 gap-6"><CardSkeleton /><CardSkeleton /></div>;
  if (vaults.length === 0) {
    return (
      <div className={`${card} text-center`}>
        <h3 className="text-[22px] font-bold text-on-background mb-2">No vaults yet</h3>
        <p className="text-on-surface-variant mb-6">Create your first vault — it takes about a minute.</p>
        <button onClick={onCreate} className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow">Create a vault</button>
      </div>
    );
  }

  const total = (f: (v: VaultAccount) => BN) => vaults.reduce((s, v) => s.add(f(v.account)), new BN(0));
  return (
    <div data-testid="my-vaults">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          ['Liquidity', formatUSDCompact(total((v) => v.totalLiquidity))],
          ['Premiums collected', formatUSDCompact(total((v) => v.totalPremiumsCollected))],
          ['Fees to collect', formatUSDC(total((v) => v.creatorFeesAccrued))],
          ['Claims paid', formatUSDCompact(total((v) => v.totalClaimsPaid))],
        ].map(([l, v]) => (
          <div key={l} className="bg-surface-container-lowest/85 rounded-[16px] p-5 border border-white/60 floating-shadow">
            <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-1">{l}</p>
            <p className="text-[22px] font-bold text-on-background">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        {vaults.map(({ key, account: v }) => {
          const phase = vaultPhase(v, now);
          const isWeather = 'weather' in v.triggerType;
          return (
            <Link key={key} href={`/vaults/${key}`} className={`${card} !p-6 hover:-translate-y-1 transition-transform block`}>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-2 text-[13px] font-bold text-on-secondary-container">
                  {isWeather ? <CloudRain className="w-4 h-4" /> : <Plane className="w-4 h-4" />} Vault #{v.vaultId.toString()}
                </span>
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-secondary-container text-on-secondary-container">{v.isPaused && phase === 'open' ? 'Paused' : PHASE_LABEL[phase]}</span>
              </div>
              <p className="font-bold text-on-background mb-4">{triggerDescription(v)}</p>
              <div className="grid grid-cols-3 gap-3 text-[13px] mb-4">
                <div><p className="text-on-surface-variant">Liquidity</p><p className="font-bold text-on-background">{formatUSDC(v.totalLiquidity)}</p></div>
                <div><p className="text-on-surface-variant">Active</p><p className="font-bold text-on-background">{v.activePolicies.toString()} · {vaultCapacity(v)} free</p></div>
                <div><p className="text-on-surface-variant">Fees</p><p className="font-bold text-on-background">{formatUSDC(v.creatorFeesAccrued)}</p></div>
              </div>
              <div className="flex flex-wrap gap-2 text-[12px]">
                {v.pendingClaims.gtn(0) && <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">{v.pendingClaims.toString()} claim(s) being verified</span>}
                {phase === 'settling' && now >= v.vaultExpiry.toNumber() && !v.isClosed && <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 font-bold">Ready to close & withdraw</span>}
                {!v.creatorFeesAccrued.isZero() && <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container font-bold">Fees to collect</span>}
                <span className="text-on-surface-variant py-1">
                  {phase === 'open' ? `Sales close ${relativeTime(v.subscriptionEnd.toNumber(), now)}` : phase === 'covering' ? `Coverage ends ${relativeTime(v.coverageEnd.toNumber(), now)}` : phase === 'upcoming' ? `Opens ${relativeTime(v.subscriptionStart.toNumber(), now)}` : ''}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CreateVault() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const program = useProgram();
  const toast = useToast();
  const balances = useBalances();
  const router = useRouter();
  const chainNow = useChainNow();

  const [triggerType, setTriggerType] = useState<TriggerType>('Weather');
  const [triggerThreshold, setTriggerThreshold] = useState('50');
  const [observationDays, setObservationDays] = useState('30');
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [regionKm, setRegionKm] = useState(100);
  const [premiumAmount, setPremiumAmount] = useState('5');
  const [coverageAmount, setCoverageAmount] = useState('100');
  const [creatorFeeBps, setCreatorFeeBps] = useState('500');
  const [depositAmount, setDepositAmount] = useState('500');
  const [subscriptionStart, setSubscriptionStart] = useState('');
  const [subscriptionEnd, setSubscriptionEnd] = useState('');
  const [coverageStart, setCoverageStart] = useState('');
  const [coverageEnd, setCoverageEnd] = useState('');
  const [vaultExpiry, setVaultExpiry] = useState('');
  const [vaultId, setVaultId] = useState('0');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [done, setDone] = useState<{ sig: string; vault: string } | null>(null);

  const isWeather = triggerType === 'Weather';
  const region = useMemo(() => (center ? regionAround(center.lat, center.lon, regionKm) : null), [center, regionKm]);

  const applyPreset = useCallback(() => {
    const now = chainNow;
    const subOpen = now + 3 * 60;
    const covStart = subOpen + 3 * DAY;
    setSubscriptionStart(toLocalInput(subOpen));
    setSubscriptionEnd(toLocalInput(covStart));
    setCoverageStart(toLocalInput(covStart));
    setCoverageEnd(toLocalInput(covStart + 90 * DAY));
    setVaultExpiry(toLocalInput(covStart + 104 * DAY));
  }, [chainNow]);

  useEffect(() => {
    if (subscriptionStart) return;
    const id = setTimeout(applyPreset, 0);
    return () => clearTimeout(id);
  }, [applyPreset, subscriptionStart]);

  useEffect(() => {
    if (!publicKey) return;
    // Read the chain directly: the cached list can miss a vault created seconds ago.
    loadVaults(program, publicKey, { fresh: true })
      .then((mine) => setVaultId(String(mine.reduce((m, v) => Math.max(m, v.account.vaultId.toNumber() + 1), 0))))
      .catch(() => {});
  }, [publicKey, program]);

  const validate = (): string | null => {
    const now = chainNow;
    const [ss, se, cs, ce, ex] = [subscriptionStart, subscriptionEnd, coverageStart, coverageEnd, vaultExpiry].map(toUnix);
    if ([ss, se, cs, ce, ex].some((t) => !Number.isFinite(t))) return 'Fill in all dates.';
    if (ss < now + 30) return 'Sales must open at least a minute from now (the transaction needs time to land). Press "Reset dates".';
    if (!(se > ss)) return 'Sales must close after they open.';
    if (!(cs >= se)) return 'Coverage must start when (or after) sales close.';
    if (!(ce > cs)) return 'Coverage must end after it starts.';
    if (ex < ce + CLAIM_FILING_GRACE) return 'Vault expiry must be at least 7 days after coverage ends, so late claims can still be filed.';
    const fee = Number(creatorFeeBps);
    if (!Number.isInteger(fee) || fee < 0 || fee > MAX_CREATOR_FEE_BPS) return `Creator fee must be 0–${MAX_CREATOR_FEE_BPS} bps.`;
    const threshold = Number(triggerThreshold);
    if (!Number.isInteger(threshold) || threshold <= 0) return 'Threshold must be a positive whole number.';
    if (!isWeather && threshold > 3 * 24 * 60) return 'Delay threshold can be at most 4320 minutes (3 days).';
    if (isWeather) {
      const d = Number(observationDays);
      if (!Number.isInteger(d) || d < 1 || d > 90) return 'Observation window must be 1–90 days.';
      if (ce - cs < d * DAY) return 'Coverage must be at least as long as the observation window.';
      if (!region) return 'Pick the coverage region on the map.';
    }
    try {
      if (toUSDC(premiumAmount).isZero()) return 'Premium must be greater than zero.';
      if (toUSDC(coverageAmount).lte(toUSDC(premiumAmount))) return 'Payout must be larger than the premium.';
      const dep = depositAmount ? toUSDC(depositAmount) : new BN(0);
      if (balances.usdc !== null && BigInt(dep.toString()) > balances.usdc) {
        return `You have ${(Number(balances.usdc) / 1e6).toFixed(2)} USDC — lower the deposit or get test USDC at faucet.circle.com.`;
      }
    } catch (e) {
      return errorMessage(e);
    }
    return null;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return setVisible(true);
    const problem = validate();
    setErrorMsg(problem ?? '');
    if (problem) return;
    setBusy(true);
    const tid = toast.show({ kind: 'pending', title: 'Creating your vault', body: 'Approve in your wallet…' });
    try {
      // The ID is internal: if it's been taken (another tab, a stale suggestion), use the next free one.
      let vaultIdBN = new BN(vaultId);
      let vault = vaultPDA(publicKey, vaultIdBN);
      for (let tries = 0; await connection.getAccountInfo(vault); tries++) {
        if (tries >= 50) throw new Error('Could not find a free vault ID. Set one manually.');
        vaultIdBN = vaultIdBN.addn(1);
        vault = vaultPDA(publicKey, vaultIdBN);
      }
      if (vaultIdBN.toString() !== vaultId) setVaultId(vaultIdBN.toString());
      const treasury = vaultTreasuryPDA(vault);
      const init = await program.methods
        .initializeVault(
          vaultIdBN,
          isWeather ? { weather: {} } : { flightDelay: {} },
          new BN(triggerThreshold),
          isWeather ? Number(observationDays) : 0,
          isWeather && region ? region : { minLatE6: 0, maxLatE6: 0, minLonE6: 0, maxLonE6: 0 },
          toUSDC(premiumAmount),
          toUSDC(coverageAmount),
          new BN(toUnix(subscriptionStart)),
          new BN(toUnix(subscriptionEnd)),
          new BN(toUnix(coverageStart)),
          new BN(toUnix(coverageEnd)),
          new BN(toUnix(vaultExpiry)),
          Number(creatorFeeBps)
        )
        .accountsStrict({
          authority: publicKey, config: configPDA(), usdcMint: USDC_MINT, vault, vaultTreasury: treasury,
          tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .instruction();
      const tx = new Transaction().add(init);
      const dep = depositAmount ? toUSDC(depositAmount) : new BN(0);
      if (!dep.isZero()) {
        tx.add(
          await program.methods.depositLiquidity(dep)
            .accountsStrict({ creator: publicKey, vault, vaultTreasury: treasury, creatorUsdc: usdcAta(publicKey), usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID })
            .instruction()
        );
      }
      const sig = await sendTransaction(tx, connection);
      const bh = await connection.getLatestBlockhash();
      const conf = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      if (conf.value.err) throw new Error(`Transaction failed: ${JSON.stringify(conf.value.err)}`);
      toast.update(tid, { kind: 'success', title: 'Vault is live', sig });
      setDone({ sig, vault: vault.toBase58() });
    } catch (err) {
      console.error(err);
      const msg = errorMessage(err);
      toast.update(tid, { kind: 'error', title: 'Could not create vault', body: msg });
      setErrorMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={`${card} text-center`} data-testid="vault-created">
        <CheckCircle className="w-16 h-16 text-green-700 mx-auto mb-4" />
        <h2 className="text-[28px] font-bold text-on-background mb-2">Your vault is live</h2>
        <p className="text-on-surface-variant mb-8">Share it with farmers or travellers — or post it as a Blink from the vault page.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button onClick={() => router.push(`/vaults/${done.vault}`)} className="bg-primary text-on-primary px-8 py-4 rounded-full font-bold electric-glow">Open vault</button>
          <a href={explorerTx(done.sig)} target="_blank" rel="noopener noreferrer" className="px-8 py-4 rounded-full font-bold border border-outline-variant">View transaction</a>
        </div>
      </div>
    );
  }

  const cs = toUnix(coverageStart), ce = toUnix(coverageEnd);

  return (
    <form onSubmit={handleCreate} className="space-y-8">
      <section className={card}>
        <h2 className="text-[20px] font-bold text-on-background mb-6">1 · What do you insure?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['Weather', 'FlightDelay'] as TriggerType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => { setTriggerType(type); setTriggerThreshold(type === 'Weather' ? '50' : '120'); }}
              aria-pressed={triggerType === type}
              className={`p-6 rounded-[14px] border-2 text-left transition-all flex items-start gap-4 ${triggerType === type ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest hover:border-primary/30'}`}
            >
              <div className={`p-3 rounded-full flex-shrink-0 ${triggerType === type ? 'bg-primary text-on-primary' : 'bg-secondary-container text-on-secondary-container'}`}>
                {type === 'Weather' ? <CloudRain className="w-6 h-6" /> : <Plane className="w-6 h-6" />}
              </div>
              <div>
                <h3 className={`text-[18px] font-bold mb-1 ${triggerType === type ? 'text-primary' : 'text-on-background'}`}>{type === 'Weather' ? 'Crop drought' : 'Flight delay'}</h3>
                <p className="text-[14px] text-on-surface-variant">
                  {type === 'Weather' ? 'Pays when rainfall at a farm stays below your threshold. Monthly premiums.' : 'Pays when a flight is cancelled, diverted or late. One-off premium.'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[20px] font-bold text-on-background mb-6">2 · The rule</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className={labelCls} htmlFor="threshold">{isWeather ? 'Rainfall threshold (mm)' : 'Delay threshold (minutes)'}</label>
            <input id="threshold" type="number" min="1" required value={triggerThreshold} onChange={(e) => setTriggerThreshold(e.target.value)} className={inputCls} />
            <p className={hintCls}>{isWeather ? 'Pays if total rain over the window is below this.' : 'Pays if departure or arrival is at least this late.'}</p>
          </div>
          {isWeather && (
            <div>
              <label className={labelCls} htmlFor="obs">Observation window (days)</label>
              <input id="obs" type="number" min="1" max="90" required value={observationDays} onChange={(e) => setObservationDays(e.target.value)} className={inputCls} />
              <p className={hintCls}>Rain is summed over this many consecutive days.</p>
            </div>
          )}
        </div>
        {isWeather && (
          <div className="grid gap-8">
            <div className="min-w-0">
              <p className={labelCls}>Coverage region</p>
              <MapPicker
                point={center}
                onChange={(lat, lon) => setCenter({ lat, lon })}
                box={region ? { minLat: region.minLatE6 / 1e6, maxLat: region.maxLatE6 / 1e6, minLon: region.minLonE6 / 1e6, maxLon: region.maxLonE6 / 1e6 } : null}
                placeholder="Centre of the area you'll cover…"
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {REGION_SIZES.map((s) => (
                  <button key={s.km} type="button" onClick={() => setRegionKm(s.km)} className={`px-4 py-2 rounded-full text-[12px] font-bold ${regionKm === s.km ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {region && <p className={hintCls}>Farms must be inside {regionLabel(region)}. Keep it tight so one price fits the climate.</p>}
            </div>
            <div className="min-w-0">
              <p className={labelCls}>Price it</p>
              {center ? (
                <BacktestPanel
                  mode="creator"
                  lat={center.lat}
                  lon={center.lon}
                  coverageStart={cs}
                  coverageEnd={ce}
                  observationDays={Number(observationDays)}
                  thresholdMm={Number(triggerThreshold)}
                  payoutUsd={Number(coverageAmount) || 0}
                  premiumUsd={Number(premiumAmount) || undefined}
                  onSuggestPremium={(usd) => setPremiumAmount(usd.toFixed(2))}
                />
              ) : (
                <div className="rounded-[14px] border border-dashed border-outline-variant p-8 text-center text-on-surface-variant text-[14px]">
                  Pick a region centre to see how often this rule would have paid out there over the last 10 years, and a suggested premium.
                </div>
              )}
            </div>
          </div>
        )}
        {!isWeather && (
          <p className="text-[14px] text-on-surface-variant rounded-[12px] bg-surface-container-low p-4">
            Free flight APIs don&apos;t offer the history needed for a backtest. As a rough guide, US on-time statistics show about 1 in 5 flights arriving 15+ minutes late and
            1–2% cancelled; longer thresholds trigger far less often. Price conservatively.
          </p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-[20px] font-bold text-on-background mb-6">3 · Money</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className={labelCls} htmlFor="payout">Payout per policy (USDC)</label>
            <input id="payout" type="text" inputMode="decimal" required value={coverageAmount} onChange={(e) => setCoverageAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="premium">Premium (USDC{isWeather ? ' / month' : ''})</label>
            <input id="premium" type="text" inputMode="decimal" required value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="fee">Your fee (bps)</label>
            <input id="fee" type="number" min="0" max={MAX_CREATOR_FEE_BPS} required value={creatorFeeBps} onChange={(e) => setCreatorFeeBps(e.target.value)} className={inputCls} />
            <p className={hintCls}>500 = 5% of each premium, claimable any time.</p>
          </div>
        </div>
        <div className="mt-6">
          <label className={labelCls} htmlFor="deposit">Initial liquidity (USDC)</label>
          <input id="deposit" type="text" inputMode="decimal" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} className={inputCls} />
          <p className={hintCls}>
            {(() => {
              try {
                const n = toUSDC(coverageAmount || '0').isZero() ? 0 : toUSDC(depositAmount || '0').div(toUSDC(coverageAmount)).toNumber();
                return `Enough to sell ${n} polic${n === 1 ? 'y' : 'ies'}. Each policy locks one payout. `;
              } catch { return ''; }
            })()}
            {balances.usdc !== null && `You hold ${(Number(balances.usdc) / 1e6).toFixed(2)} USDC.`}
          </p>
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[20px] font-bold text-on-background">4 · Timeline</h2>
          <button type="button" onClick={applyPreset} className="flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-[13px] font-bold text-primary">
            <Wand2 className="w-4 h-4" /> Reset dates
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: 'Sales open', val: subscriptionStart, set: setSubscriptionStart },
            { label: 'Sales close', val: subscriptionEnd, set: setSubscriptionEnd },
            { label: 'Coverage starts', val: coverageStart, set: setCoverageStart },
            { label: 'Coverage ends', val: coverageEnd, set: setCoverageEnd },
            { label: 'Vault expires', val: vaultExpiry, set: setVaultExpiry },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className={labelCls}>{label}</label>
              <input type="datetime-local" required value={val} onChange={(e) => set(e.target.value)} className={inputCls} aria-label={label} />
            </div>
          ))}
          <div>
            <label className={labelCls} htmlFor="vid">Vault ID</label>
            <input id="vid" type="number" min="0" required value={vaultId} onChange={(e) => setVaultId(e.target.value)} className={inputCls} />
            <p className={hintCls}>Pre-filled with your next free ID.</p>
          </div>
        </div>
        <p className={hintCls}>After expiry you withdraw whatever is left. Leave a week or two after coverage ends for final claims.</p>
      </section>

      {errorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-[12px] bg-error-container text-on-error-container" role="alert">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p className="text-[14px]">{errorMsg}</p>
        </div>
      )}

      <button type="submit" disabled={busy} data-testid="create-vault" className="w-full py-5 rounded-full font-bold text-[18px] flex items-center justify-center gap-3 bg-primary text-on-primary electric-glow hover:scale-[1.01] transition-transform disabled:opacity-60">
        {busy ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating vault…</> : publicKey ? <><Plus className="w-5 h-5" /> Create vault <ArrowRight className="w-5 h-5" /></> : 'Connect wallet to create'}
      </button>
    </form>
  );
}

export default function CreatorPage() {
  return (
    <Suspense fallback={null}>
      <CreatorInner />
    </Suspense>
  );
}
