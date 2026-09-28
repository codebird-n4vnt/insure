'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AnchorProvider, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  AlertCircle, ArrowLeft, CheckCircle, CloudRain, Copy, Droplets, ExternalLink, Loader2, Pause, Plane, Play, Share2, Shield, Wallet,
} from 'lucide-react';
import {
  BACKEND_URL, CLAIM_FILING_GRACE, CLUSTER, DAY, GRACE_PERIOD, ORACLE_FEE, isReleasable, PHASE_LABEL, USDC_MINT, claimPDA, claimStatusLabel, claimUrl, errorMessage,
  explorerAddress, formatDate, formatUSDC, formatUtcDate, inRegion, observedLabel, policyPDA, regionCenter, regionLabel, relativeTime,
  riskSummary, toUSDC, triggerDescription, usdcAta, vaultCapacity, vaultPhase, vaultTreasuryPDA,
  type ClaimAccount, type PolicyAccount, type VaultAccount,
} from '@/lib/anchor';
import { useProgram } from '@/lib/useProgram';
import { loadPoliciesForVault } from '@/lib/data';
import { useBalances } from '@/lib/useBalances';
import { useChainNow } from '@/lib/useChainNow';
import { ErrorBanner } from '@/components/ui/Banners';
import { useToast } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import MapPicker from '@/components/map/MapPicker';
import BacktestPanel from '@/components/insights/BacktestPanel';

const MIN_SOL = 0.005; // policy + claim account rent and fees
const inputCls =
  'w-full px-6 py-4 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background';
const labelCls = 'block text-[12px] font-bold tracking-[0.1em] uppercase text-on-background mb-2';
const card = 'bg-surface-container-lowest/85 backdrop-blur-md rounded-[16px] p-6 md:p-10 floating-shadow border border-white/60';
const btn =
  'px-8 py-4 rounded-full font-bold bg-primary text-on-primary electric-glow hover:scale-[1.03] transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 whitespace-nowrap';
const btnGhost =
  'px-6 py-3 rounded-full font-bold border border-outline-variant text-on-background hover:border-primary/40 transition-all disabled:opacity-50 flex items-center gap-2 whitespace-nowrap';

type Action = 'subscribe' | 'renew' | 'claim' | 'deposit' | 'withdrawExcess' | 'fees' | 'pause' | 'close' | 'release';

/** Mirrors raise_claim's checks so we can tell the user exactly why they can't claim yet. */
function claimEligibility(vault: VaultAccount, policy: PolicyAccount, now: number): { ok: boolean; reason: string } {
  if (vault.isClosed) return { ok: false, reason: 'This vault is closed.' };
  if (policy.released) return { ok: false, reason: 'This policy expired after coverage lapsed.' };
  if (policy.paidOut) return { ok: false, reason: 'This policy has already been paid out.' };
  if (policy.hasPendingClaim) return { ok: false, reason: 'Your claim is being verified — this page updates automatically.' };
  if (now < vault.coverageStart.toNumber()) return { ok: false, reason: `Coverage starts ${formatDate(vault.coverageStart.toNumber(), true)}.` };
  const coveredFrom = policy.coveredFrom.toNumber();
  const personalEnd = policy.personalCoverageEnd.toNumber();

  if ('weather' in policy.risk) {
    const windowEnd = coveredFrom + vault.observationDays * DAY;
    const coveredUntil = Math.min(personalEnd, vault.coverageEnd.toNumber());
    if (now < windowEnd) {
      return { ok: false, reason: `Rainfall is measured over ${vault.observationDays} day${vault.observationDays === 1 ? '' : 's'} of coverage — you can claim from ${formatDate(windowEnd, true)} (${relativeTime(windowEnd, now)}).` };
    }
    if (coveredUntil < windowEnd) return { ok: false, reason: 'Your paid coverage is shorter than the observation window. Renew first.' };
    if (now > coveredUntil + CLAIM_FILING_GRACE || now >= vault.vaultExpiry.toNumber()) {
      return { ok: false, reason: 'The claim window for this coverage period has closed.' };
    }
    return { ok: true, reason: '' };
  }
  const flightDate = (policy.risk as { flightDelay: { flightDate: BN } }).flightDelay.flightDate.toNumber();
  if (now < flightDate) return { ok: false, reason: `You can claim once your flight date (${formatUtcDate(flightDate)}) begins — ${relativeTime(flightDate, now)}.` };
  if (now >= vault.vaultExpiry.toNumber()) return { ok: false, reason: 'The vault has expired.' };
  return { ok: true, reason: '' };
}

function renewEligibility(vault: VaultAccount, policy: PolicyAccount, now: number): boolean {
  const end = policy.personalCoverageEnd.toNumber();
  return (
    'weather' in vault.triggerType && !vault.isClosed && !policy.paidOut && !policy.released &&
    now <= vault.coverageEnd.toNumber() && end < vault.coverageEnd.toNumber() && now <= end + GRACE_PERIOD
  );
}

export default function VaultDetailPage() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const program = useProgram();
  const toast = useToast();
  const balances = useBalances();
  const vaultKey = useMemo(() => {
    try { return new PublicKey(pubkey); } catch { return null; }
  }, [pubkey]);

  const [vault, setVault] = useState<VaultAccount | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [treasuryBalance, setTreasuryBalance] = useState('0');
  const [policy, setPolicy] = useState<PolicyAccount | null>(null);
  const [claims, setClaims] = useState<{ key: string; account: ClaimAccount }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const now = useChainNow();

  const [busy, setBusy] = useState<Action | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Action, string>>>({});

  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [flightNumber, setFlightNumber] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [vaultPolicies, setVaultPolicies] = useState<{ key: PublicKey; account: PolicyAccount }[]>([]);

  // Bump to re-read everything (after a transaction, or when a subscribed account changes).
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!vaultKey) return;
    let alive = true;
    (async () => {
      try {
        const v = await program.account.vault.fetchNullable(vaultKey);
        if (!alive) return;
        if (!v) { setNotFound(true); setLoaded(true); return; }
        const bal = await connection.getTokenAccountBalance(vaultTreasuryPDA(vaultKey)).catch(() => null);
        let p: PolicyAccount | null = null;
        let rows: { key: string; account: ClaimAccount }[] = [];
        if (publicKey) {
          p = await program.account.policyHolder.fetchNullable(policyPDA(vaultKey, publicKey));
          if (p) {
            const keys = Array.from({ length: p.claimCount.toNumber() }, (_, i) => claimPDA(vaultKey, publicKey, new BN(i)));
            const accs = keys.length ? await program.account.claim.fetchMultiple(keys) : [];
            rows = accs
              .map((a, i) => (a ? { key: keys[i].toBase58(), account: a } : null))
              .filter((c): c is { key: string; account: ClaimAccount } => c !== null)
              .reverse();
          }
        }
        // Underwriters see which lapsed policies can be released.
        const all = publicKey && v.authority.equals(publicKey)
          ? await loadPoliciesForVault(program, vaultKey, { fresh: tick > 0 }).catch(() => [])
          : [];
        if (!alive) return;
        setVault(v);
        setVaultPolicies(all.map((r) => ({ key: r.publicKey, account: r.account })));
        setTreasuryBalance(bal?.value.amount ?? '0');
        setPolicy(p);
        setClaims(rows);
      } catch (err) {
        console.error(err);
      }
      if (alive) setLoaded(true);
    })();
    return () => { alive = false; };
  }, [program, connection, vaultKey, publicKey, tick]);

  // Live: re-read when the vault or my policy changes; toast when a pending claim settles.
  const pendingKeys = claims.filter((c) => 'pending' in c.account.status).map((c) => c.key).join(',');
  useEffect(() => {
    if (!vaultKey) return;
    const subs: number[] = [];
    subs.push(connection.onAccountChange(vaultKey, () => refresh(), 'confirmed'));
    if (publicKey) subs.push(connection.onAccountChange(policyPDA(vaultKey, publicKey), () => refresh(), 'confirmed'));
    for (const k of pendingKeys ? pendingKeys.split(',') : []) {
      subs.push(
        connection.onAccountChange(new PublicKey(k), (acc) => {
          try {
            const c = program.coder.accounts.decode<ClaimAccount>('claim', acc.data);
            if ('approved' in c.status) {
              toast.show({ kind: 'success', title: `Claim approved — ${formatUSDC(c.payoutAmount)} sent to your wallet`, body: observedLabel(c) ?? undefined, href: { label: 'See the evidence', url: claimUrl(k) } });
              balances.refresh();
            } else if ('rejected' in c.status) {
              toast.show({ kind: 'info', title: 'Claim settled: trigger not met', body: observedLabel(c) ?? undefined, href: { label: 'See the evidence', url: claimUrl(k) } });
            }
          } catch { /* ignore */ }
          refresh();
        }, 'confirmed')
      );
    }
    return () => subs.forEach((id) => void connection.removeAccountChangeListener(id).catch(() => {}));
  }, [connection, program, vaultKey, publicKey, pendingKeys, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action: Action, label: string, fn: () => Promise<string>, success: string) => {
    setBusy(action);
    setErrors((e) => ({ ...e, [action]: '' }));
    const id = toast.show({ kind: 'pending', title: label, body: 'Approve in your wallet…' });
    try {
      const sig = await fn();
      toast.update(id, { kind: 'success', title: success, sig });
      refresh();
      balances.refresh();
    } catch (err) {
      console.error(err);
      const msg = errorMessage(err);
      toast.update(id, { kind: 'error', title: 'Transaction failed', body: msg });
      setErrors((e) => ({ ...e, [action]: msg }));
    } finally {
      setBusy(null);
    }
  };

  if (!loaded && vaultKey) {
    return (
      <div className="px-6 md:px-8 py-10 max-w-[1280px] mx-auto">
        <Skeleton className="h-64 w-full rounded-[16px] mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[16px]" />)}</div>
      </div>
    );
  }
  if (notFound || !vault || !vaultKey) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-center px-8">
        <div>
          <AlertCircle className="w-16 h-16 text-error mx-auto mb-4" />
          <h2 className="text-[24px] font-bold text-on-background mb-2">Vault not found</h2>
          <p className="text-on-surface-variant mb-4">Check the address, or the vault may be on a different network.</p>
          <Link href="/vaults" className="text-primary font-bold hover:underline">← Back to vaults</Link>
        </div>
      </div>
    );
  }

  const isWeather = 'weather' in vault.triggerType;
  const isCreator = !!publicKey && publicKey.equals(vault.authority);
  const treasury = vaultTreasuryPDA(vaultKey);
  const committed = vault.activePolicies.mul(vault.coverageAmount);
  const free = vault.totalLiquidity.sub(committed);
  const capacity = vaultCapacity(vault);
  const phase = vaultPhase(vault, now);
  const subscriptionOpen = phase === 'open' && !vault.isPaused;
  const box = isWeather
    ? { minLat: vault.region.minLatE6 / 1e6, maxLat: vault.region.maxLatE6 / 1e6, minLon: vault.region.minLonE6 / 1e6, maxLon: vault.region.maxLonE6 / 1e6 }
    : null;
  const pointInRegion = point ? inRegion(vault.region, point.lat, point.lon) : false;
  const usdcShort = balances.usdc !== null && balances.usdc < BigInt(vault.premiumAmount.toString());
  const solShort = balances.sol !== null && balances.sol < MIN_SOL;
  const blinkUrl = `https://dial.to/?action=solana-action:${encodeURIComponent(`${BACKEND_URL}/api/actions/vaults/${vaultKey.toBase58()}`)}&cluster=${CLUSTER}`;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ kind: 'success', title: `${what} copied` });
    } catch {
      toast.show({ kind: 'error', title: 'Could not copy', body: text });
    }
  };

  // ─── actions ───────────────────────────────────────────────────────────

  const subscribe = () =>
    run('subscribe', 'Buying your policy', async () => {
      let risk;
      if (isWeather) {
        if (!point) throw new Error('Pick your farm on the map first.');
        if (!pointInRegion) throw new Error(`Your farm must be inside this vault's region (${regionLabel(vault.region)}).`);
        risk = { weather: { latitudeE6: Math.round(point.lat * 1e6), longitudeE6: Math.round(point.lon * 1e6) } };
      } else {
        const fn = flightNumber.toUpperCase().replace(/\s/g, '');
        if (!/^[A-Z0-9]{3,8}$/.test(fn)) throw new Error('Flight number must be 3–8 letters/digits, e.g. AI101.');
        if (!flightDate) throw new Error('Pick the flight date.');
        const date = Math.floor(Date.parse(`${flightDate}T00:00:00Z`) / 1000);
        if (date < vault.coverageStart.toNumber() || date > vault.coverageEnd.toNumber()) {
          throw new Error(`Flight date must be between ${formatUtcDate(vault.coverageStart.toNumber())} and ${formatUtcDate(vault.coverageEnd.toNumber())} (UTC).`);
        }
        risk = { flightDelay: { flightNumber: fn, flightDate: new BN(date) } };
      }
      if (usdcShort) throw new Error(`You need ${formatUSDC(vault.premiumAmount)} USDC — get test USDC at faucet.circle.com.`);
      if (solShort) throw new Error('You need a little SOL for fees — use "Get test SOL" at the top of the page.');
      return program.methods
        .subscribe(risk)
        .accountsStrict({
          owner: publicKey!, vault: vaultKey, policy: policyPDA(vaultKey, publicKey!), ownerUsdc: usdcAta(publicKey!),
          vaultTreasury: treasury, usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();
    }, "You're covered");

  const renew = () =>
    run('renew', 'Renewing for a month', () =>
      program.methods.payPremium()
        .accountsStrict({
          owner: publicKey!, vault: vaultKey, policy: policyPDA(vaultKey, publicKey!), ownerUsdc: usdcAta(publicKey!),
          vaultTreasury: treasury, usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc(), 'Coverage extended by 30 days');

  const raiseClaim = () =>
    run('claim', 'Filing your claim', () =>
      program.methods.raiseClaim()
        .accountsStrict({
          claimant: publicKey!, vault: vaultKey, policy: policyPDA(vaultKey, publicKey!), claim: claimPDA(vaultKey, publicKey!, policy!.claimCount),
          claimantUsdc: usdcAta(publicKey!), vaultTreasury: treasury, usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc(), 'Claim filed — the oracle is checking the data');

  const creatorAccounts = () => ({
    creator: publicKey!, vault: vaultKey, vaultTreasury: treasury, creatorUsdc: usdcAta(publicKey!), usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID,
  });
  const ensureCreatorAta = () => createAssociatedTokenAccountIdempotentInstruction(publicKey!, usdcAta(publicKey!), publicKey!, USDC_MINT);

  const deposit = () =>
    run('deposit', 'Depositing liquidity', () =>
      program.methods.depositLiquidity(toUSDC(depositAmount))
        .accountsStrict({ creator: publicKey!, vault: vaultKey, vaultTreasury: treasury, creatorUsdc: usdcAta(publicKey!), usdcMint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc(), 'Liquidity deposited');
  const withdrawExcess = () =>
    run('withdrawExcess', 'Withdrawing unused liquidity', () =>
      program.methods.withdrawExcessLiquidity(toUSDC(withdrawAmount)).accountsStrict(creatorAccounts()).preInstructions([ensureCreatorAta()]).rpc(), 'Liquidity withdrawn');
  const claimFees = () =>
    run('fees', 'Collecting fees', () => program.methods.claimCreatorFees().accountsStrict(creatorAccounts()).preInstructions([ensureCreatorAta()]).rpc(), 'Fees collected');
  const togglePause = () =>
    run('pause', vault.isPaused ? 'Reopening sales' : 'Pausing sales', () => program.methods.setVaultPaused(!vault.isPaused).accountsStrict({ creator: publicKey!, vault: vaultKey }).rpc(),
      vault.isPaused ? 'Sales reopened' : 'New sales paused');
  const releasable = vaultPolicies.filter((p) => isReleasable(vault, p.account, now));
  const releaseLapsed = () =>
    run('release', `Releasing ${releasable.length} lapsed polic${releasable.length === 1 ? 'y' : 'ies'}`, async () => {
      const provider = program.provider as AnchorProvider;
      let sig = '';
      // Batch to stay well inside the transaction size limit.
      for (let i = 0; i < releasable.length; i += 8) {
        const tx = new Transaction();
        for (const p of releasable.slice(i, i + 8)) {
          tx.add(await program.methods.releaseLapsedPolicy().accountsStrict({ vault: vaultKey, policy: p.key }).instruction());
        }
        sig = await provider.sendAndConfirm(tx);
      }
      return sig;
    }, 'Capacity released');

  const closeVault = () =>
    run('close', 'Closing vault', () => program.methods.creatorWithdraw().accountsStrict(creatorAccounts()).preInstructions([ensureCreatorAta()]).rpc(), 'Vault closed and funds withdrawn');

  const spin = <Loader2 className="w-4 h-4 animate-spin" />;

  return (
    <div className="px-6 md:px-8 py-10">
      <div className="max-w-[1280px] mx-auto">
        <Link href="/vaults" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors mb-6 text-[14px] font-bold">
          <ArrowLeft className="w-4 h-4" /> All vaults
        </Link>

        {/* Header */}
        <div className="bg-on-background rounded-[18px] p-8 md:p-12 text-white mb-8 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold tracking-[0.1em] uppercase ${isWeather ? 'bg-secondary-container text-on-secondary-container' : 'bg-tertiary-fixed text-on-tertiary-fixed-variant'}`}>
                {isWeather ? <CloudRain className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
                {isWeather ? 'Drought cover' : 'Flight-delay cover'}
              </span>
              <span className="px-3 py-1.5 rounded-full text-[12px] font-bold bg-white/10">
                {vault.isPaused && phase === 'open' ? 'Sales paused' : PHASE_LABEL[phase]}
              </span>
            </div>
            <h1 className="text-[26px] md:text-[34px] font-bold mb-3 leading-tight">{triggerDescription(vault)}</h1>
            {isWeather && <p className="text-white/70 text-[14px] mb-3">Coverage region: {regionLabel(vault.region)}</p>}
            <div className="flex flex-wrap items-center gap-4">
              <a href={explorerAddress(vaultKey.toBase58())} target="_blank" rel="noopener noreferrer" className="text-white/60 text-[13px] font-mono break-all hover:underline inline-flex items-center gap-1">
                {vaultKey.toBase58()} <ExternalLink className="w-3 h-3" />
              </a>
              <button onClick={() => copy(window.location.href, 'Link')} className="text-[13px] font-bold text-white/80 hover:text-white inline-flex items-center gap-1">
                <Copy className="w-3.5 h-3.5" /> Copy link
              </button>
              <button onClick={() => copy(blinkUrl, 'Blink link')} className="text-[13px] font-bold text-white/80 hover:text-white inline-flex items-center gap-1" title="A Solana Action: buy this cover straight from X or any Blink-aware app">
                <Share2 className="w-3.5 h-3.5" /> Share as Blink
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
              {[
                ['Sales open', vault.subscriptionStart],
                ['Sales close', vault.subscriptionEnd],
                ['Coverage starts', vault.coverageStart],
                ['Coverage ends', vault.coverageEnd],
                ['Vault expires', vault.vaultExpiry],
              ].map(([label, t]) => (
                <div key={label as string}>
                  <p className="text-white/50 text-[10px] font-bold tracking-[0.1em] uppercase mb-1">{label as string}</p>
                  <p className="text-white text-[14px] font-semibold">{formatDate((t as BN).toNumber(), true)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
          {[
            ['Payout per policy', formatUSDC(vault.coverageAmount)],
            [isWeather ? 'Premium / month' : 'Premium (one-off)', formatUSDC(vault.premiumAmount)],
            ['Liquidity', formatUSDC(vault.totalLiquidity)],
            ['Policies available', vault.isClosed ? '0' : String(capacity)],
            ['Active policies', vault.activePolicies.toString()],
            ['Claims paid', formatUSDC(vault.totalClaimsPaid)],
            ['Claims filed', vault.totalClaims.toString()],
            ['Being verified', vault.pendingClaims.toString()],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface-container-lowest/85 backdrop-blur-md rounded-[16px] p-5 floating-shadow border border-white/60">
              <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant mb-1.5">{label}</p>
              <p className="text-[20px] md:text-[22px] font-bold text-on-background">{value}</p>
            </div>
          ))}
        </div>

        {/* Creator panel */}
        {isCreator && (
          <div className={`${card} mb-8`} data-testid="creator-panel">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center"><Droplets className="w-5 h-5 text-primary" /></div>
              <div>
                <h3 className="text-[20px] font-bold text-on-background">Manage your vault</h3>
                <p className="text-[13px] text-on-surface-variant">
                  Backing policies: {formatUSDC(committed)} · Free: {formatUSDC(free)} · Fees earned: {formatUSDC(vault.creatorFeesAccrued)} · Treasury: {formatUSDC(new BN(treasuryBalance))}
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <label className={labelCls} htmlFor="deposit">Add liquidity (USDC)</label>
                <div className="flex gap-3">
                  <input id="deposit" type="text" inputMode="decimal" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="100" className={inputCls} />
                  <button onClick={deposit} disabled={!!busy || !depositAmount || vault.isClosed || now >= vault.coverageEnd.toNumber()} className={btn}>
                    {busy === 'deposit' ? spin : null}Deposit
                  </button>
                </div>
                <ErrorBanner msg={errors.deposit ?? ''} />
              </div>
              <div>
                <label className={labelCls} htmlFor="withdraw">Withdraw unused liquidity (USDC)</label>
                <div className="flex gap-3">
                  <input id="withdraw" type="text" inputMode="decimal" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder={free.gtn(0) ? String(free.toNumber() / 1e6) : '0'} className={inputCls} />
                  <button onClick={withdrawExcess} disabled={!!busy || !withdrawAmount || vault.isClosed} className={btn}>
                    {busy === 'withdrawExcess' ? spin : null}Withdraw
                  </button>
                </div>
                <ErrorBanner msg={errors.withdrawExcess ?? ''} />
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-8 pt-6 border-t border-outline-variant">
              <button onClick={claimFees} disabled={!!busy || vault.creatorFeesAccrued.isZero() || vault.isClosed} className={btnGhost}>
                {busy === 'fees' ? spin : <Wallet className="w-4 h-4" />}Collect {formatUSDC(vault.creatorFeesAccrued)} fees
              </button>
              <button onClick={togglePause} disabled={!!busy || vault.isClosed} className={btnGhost}>
                {busy === 'pause' ? spin : vault.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {vault.isPaused ? 'Reopen sales' : 'Pause new sales'}
              </button>
              {releasable.length > 0 && (
                <button onClick={releaseLapsed} disabled={!!busy} className={btnGhost} title="Frees the USDC locked for policies whose owners stopped paying and can no longer claim">
                  {busy === 'release' ? spin : null}Release {releasable.length} lapsed polic{releasable.length === 1 ? 'y' : 'ies'} ({formatUSDC(vault.coverageAmount.muln(releasable.length))})
                </button>
              )}
              <button
                onClick={closeVault}
                disabled={!!busy || vault.isClosed || now < vault.vaultExpiry.toNumber()}
                title={now < vault.vaultExpiry.toNumber() ? `Available after ${formatDate(vault.vaultExpiry.toNumber(), true)}` : ''}
                className={btnGhost}
              >
                {busy === 'close' ? spin : null}Close vault &amp; withdraw all
              </button>
            </div>
            <ErrorBanner msg={errors.fees || errors.pause || errors.close || errors.release || ''} />
          </div>
        )}

        {/* Policyholder panel */}
        <div className={card} data-testid="policy-panel">
          {!publicKey ? (
            <div className="text-center py-8">
              <Shield className="w-14 h-14 text-outline mx-auto mb-4" />
              <h3 className="text-[22px] font-bold text-on-background mb-2">Connect a wallet to get covered</h3>
              <p className="text-on-surface-variant mb-6">No wallet? Pick “Demo Wallet (devnet)” to try it instantly.</p>
              <button onClick={() => openWalletModal(true)} className={`${btn} mx-auto`}>Connect wallet</button>
            </div>
          ) : policy ? (
            <PolicyPanel vault={vault} policy={policy} now={now} busy={busy} onRenew={renew} onClaim={raiseClaim} errors={errors} />
          ) : (
            <div>
              <h3 className="text-[24px] font-bold text-on-background mb-2">Buy a policy</h3>
              <p className="text-on-surface-variant mb-8">
                Pay <strong className="text-on-background">{formatUSDC(vault.premiumAmount)}</strong>{isWeather ? ' now, then monthly to stay covered,' : ' once'} and get{' '}
                <strong className="text-on-background">{formatUSDC(vault.coverageAmount)}</strong> automatically if the trigger fires.
              </p>
              {!subscriptionOpen ? (
                <p className="text-on-surface-variant font-semibold">
                  {vault.isClosed ? 'This vault is closed.'
                    : vault.isPaused ? 'The underwriter has paused new sales.'
                    : phase === 'upcoming' ? `Sales open ${formatDate(vault.subscriptionStart.toNumber(), true)} (${relativeTime(vault.subscriptionStart.toNumber(), now)}).`
                    : 'Sales for this vault have closed.'}
                </p>
              ) : capacity < 1 ? (
                <p className="text-on-surface-variant font-semibold">Fully booked — all liquidity is backing existing policies.</p>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); void subscribe(); }} className="space-y-6">
                  {isWeather ? (
                    <div className="grid lg:grid-cols-2 gap-8">
                      <div className="min-w-0">
                        <p className={labelCls}>1 · Pin your farm</p>
                        <MapPicker point={point} onChange={(lat, lon) => setPoint({ lat, lon })} box={box} fitBox />
                        {point && !pointInRegion && (
                          <p className="text-[13px] text-error mt-2 font-semibold">This spot is outside the vault&apos;s coverage region (the outlined box).</p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={labelCls}>2 · Check the history</p>
                        {point && pointInRegion ? (
                          <BacktestPanel
                            mode="buyer"
                            lat={point.lat}
                            lon={point.lon}
                            coverageStart={vault.coverageStart.toNumber()}
                            coverageEnd={vault.coverageEnd.toNumber()}
                            observationDays={vault.observationDays}
                            thresholdMm={vault.triggerThreshold.toNumber()}
                            payoutUsd={vault.coverageAmount.toNumber() / 1e6}
                          />
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-outline-variant p-8 text-center text-on-surface-variant text-[14px]">
                            Pin your farm inside the region to see how often this cover would have paid out there over the last 10 years.
                            <button type="button" className="block mx-auto mt-4 text-primary font-bold" onClick={() => setPoint(regionCenter(vault.region))}>
                              Try the region centre
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls} htmlFor="flight">Flight number (IATA)</label>
                        <input id="flight" type="text" required value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} placeholder="AI101" maxLength={8} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls} htmlFor="fdate">Departure date (UTC)</label>
                        <input
                          id="fdate" type="date" required value={flightDate} onChange={(e) => setFlightDate(e.target.value)}
                          min={formatUtcDate(Math.max(vault.coverageStart.toNumber(), now + DAY - (now % DAY)))} max={formatUtcDate(vault.coverageEnd.toNumber())}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  )}

                  {(usdcShort || solShort) && (
                    <div className="rounded-[12px] bg-amber-50 border border-amber-200 p-4 text-[14px] text-amber-900">
                      {usdcShort && (
                        <p>
                          You have {(Number(balances.usdc) / 1e6).toFixed(2)} USDC; this policy costs {formatUSDC(vault.premiumAmount)}.{' '}
                          <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Get test USDC</a>{' '}
                          (choose Solana devnet, paste <button type="button" className="underline font-mono" onClick={() => copy(publicKey.toBase58(), 'Address')}>your address</button>).
                        </p>
                      )}
                      {solShort && <p className="mt-1">You need a little SOL for network fees — use “Get test SOL” in the top bar.</p>}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <button type="submit" disabled={!!busy || (isWeather && (!point || !pointInRegion))} className={btn} data-testid="buy-policy">
                      {busy === 'subscribe' ? spin : null}Buy policy for {formatUSDC(vault.premiumAmount)}
                    </button>
                    <p className="text-[12px] text-on-surface-variant max-w-md">
                      {isWeather
                        ? 'Your pin is locked into the policy. Rainfall there is measured with Open-Meteo when you claim.'
                        : 'Your flight is locked into the policy. Buy before the flight date begins (UTC).'}
                    </p>
                  </div>
                  <ErrorBanner msg={errors.subscribe ?? ''} />
                </form>
              )}
            </div>
          )}
        </div>

        {/* Claim history */}
        {publicKey && claims.length > 0 && (
          <div className={`${card} mt-8`}>
            <h3 className="text-[20px] font-bold text-on-background mb-6">Your claims</h3>
            <div className="space-y-4">
              {claims.map(({ key, account }) => <ClaimRow key={key} claimKey={key} claim={account} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PolicyPanel(props: {
  vault: VaultAccount;
  policy: PolicyAccount;
  now: number;
  busy: Action | null;
  onRenew: () => void;
  onClaim: () => void;
  errors: Partial<Record<Action, string>>;
}) {
  const { vault, policy, now, busy, onRenew, onClaim, errors } = props;
  const end = policy.personalCoverageEnd.toNumber();
  const active = !policy.paidOut && now <= end && now >= vault.coverageStart.toNumber();
  const eligibility = claimEligibility(vault, policy, now);
  const canRenew = renewEligibility(vault, policy, now);
  const status = policy.paidOut ? 'Paid out' : policy.released ? 'Expired' : policy.hasPendingClaim ? 'Claim being verified' : now < vault.coverageStart.toNumber() ? 'Starts soon' : active ? 'Active' : 'Lapsed';

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <CheckCircle className={`w-8 h-8 ${policy.paidOut || active ? 'text-green-700' : 'text-outline'}`} />
        <h3 className="text-[22px] font-bold text-on-background" data-testid="policy-status">Your policy · {status}</h3>
      </div>
      <p className="text-on-background mb-1">{riskSummary(policy.risk)}</p>
      <p className="text-on-surface-variant mb-8">
        Covered {formatDate(policy.coveredFrom.toNumber())} → {formatDate(end)} · Premiums paid {formatUSDC(policy.totalPremiumsPaid)}
      </p>
      <div className="flex flex-wrap gap-6 items-start">
        <div>
          <button onClick={onClaim} disabled={!!busy || !eligibility.ok} className={btn} data-testid="file-claim">
            {busy === 'claim' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}File a claim
          </button>
          <p className="text-[13px] text-on-surface-variant mt-2 max-w-sm">
            {eligibility.ok ? `A ${formatUSDC(ORACLE_FEE)} verification fee applies. The oracle checks the data and pays automatically.` : eligibility.reason}
          </p>
        </div>
        {'weather' in vault.triggerType && (
          <div>
            <button onClick={onRenew} disabled={!!busy || !canRenew} className={btnGhost}>
              {busy === 'renew' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Renew 30 days · {formatUSDC(vault.premiumAmount)}
            </button>
            {!canRenew && !policy.paidOut && (
              <p className="text-[13px] text-on-surface-variant mt-2 max-w-xs">
                {end >= vault.coverageEnd.toNumber() ? 'Covered until the end of this vault.' : 'The renewal window has passed.'}
              </p>
            )}
          </div>
        )}
      </div>
      <ErrorBanner msg={errors.claim || errors.renew || ''} />
    </div>
  );
}

function ClaimRow({ claimKey, claim }: { claimKey: string; claim: ClaimAccount }) {
  const { label, variant } = claimStatusLabel(claim.status);
  const cls = { pending: 'bg-amber-100 text-amber-800', approved: 'bg-green-100 text-green-800', rejected: 'bg-surface-container text-on-surface-variant' }[variant];
  const observed = observedLabel(claim);
  return (
    <Link href={claimUrl(claimKey)} className="block border border-outline-variant rounded-[12px] p-5 hover:border-primary/40 transition-colors" data-testid="claim-row">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-on-surface-variant">Claim #{claim.claimNumber.toString()}</span>
          <span className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${cls}`} data-testid="claim-status">{label}</span>
        </div>
        <span className="text-[12px] text-on-surface-variant">Filed {formatDate(claim.filedAt.toNumber(), true)}</span>
      </div>
      {variant === 'pending' ? (
        <p className="text-[13px] text-on-surface-variant flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin text-amber-700" />
          The oracle is fetching real-world data. Flight claims wait for landing data if needed.
        </p>
      ) : (
        <p className={`text-[14px] font-semibold ${variant === 'approved' ? 'text-green-800' : 'text-on-background'}`}>
          {variant === 'approved' ? `${formatUSDC(claim.payoutAmount)} paid to your wallet` : 'Trigger not met'}
          {observed ? ` · ${observed}` : ''}
          <span className="text-primary font-bold ml-2">View evidence →</span>
        </p>
      )}
    </Link>
  );
}
