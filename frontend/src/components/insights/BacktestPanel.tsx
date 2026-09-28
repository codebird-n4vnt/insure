'use client';

import { useEffect, useState } from 'react';
import { History, Loader2, Sparkles } from 'lucide-react';
import { SeasonChart } from '@/components/charts/charts';
import { backtestWeather, expectedLossRatio, premiumPeriods, suggestPremium, type BacktestResult } from '@/lib/backtest';

interface Props {
  lat: number;
  lon: number;
  coverageStart: number;
  coverageEnd: number;
  observationDays: number;
  thresholdMm: number;
  payoutUsd: number;
  premiumUsd?: number;
  mode: 'buyer' | 'creator';
  onSuggestPremium?: (usd: number) => void;
}

export default function BacktestPanel(props: Props) {
  const { lat, lon, coverageStart, coverageEnd, observationDays, thresholdMm, payoutUsd, premiumUsd, mode, onSuggestPremium } = props;
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const valid =
    Number.isFinite(lat) && Number.isFinite(lon) && coverageEnd > coverageStart && observationDays >= 1 && thresholdMm > 0;

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      setError('');
      backtestWeather({ lat, lon, coverageStart, coverageEnd, observationDays, thresholdMm })
        .then((r) => alive && setResult(r))
        .catch((e) => alive && setError(e?.message ?? 'Backtest failed'))
        .finally(() => alive && setLoading(false));
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [lat, lon, coverageStart, coverageEnd, observationDays, thresholdMm, valid]);

  if (!valid) return null;

  const periods = premiumPeriods(coverageStart, coverageEnd, true);
  const suggested = result ? suggestPremium(result.probability, payoutUsd, periods) : null;
  const lossRatio = result && premiumUsd ? expectedLossRatio(result.probability, payoutUsd, premiumUsd, periods) : null;

  return (
    <div className="rounded-[14px] border border-outline-variant bg-surface-container-lowest p-6 min-w-0" data-testid="backtest">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-4 h-4 text-primary" />
        <h4 className="text-[15px] font-bold text-on-background">
          {mode === 'buyer' ? 'How often would this have paid out?' : 'Historical risk at this location'}
        </h4>
      </div>
      <p className="text-[13px] text-on-surface-variant mb-4">
        The exact rule — any {observationDays}-day stretch under {thresholdMm} mm — replayed over the same calendar window in past years ({result?.source ?? 'Open-Meteo ERA5'}).
      </p>

      {loading && !result && (
        <div className="flex items-center gap-2 text-[13px] text-on-surface-variant py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Fetching 10 years of rainfall…
        </div>
      )}
      {error && <p className="text-[13px] text-error">{error}</p>}

      {result && (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <div>
              <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant">Paid out in</p>
              <p className="text-[26px] font-bold text-on-background" data-testid="backtest-hits">
                {result.triggeredCount} of {result.seasons.length} seasons
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant">Est. yearly chance</p>
              <p className="text-[26px] font-bold text-on-background">{Math.round(result.probability * 100)}%</p>
            </div>
            {mode === 'creator' && suggested !== null && (
              <div>
                <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-on-surface-variant">Suggested premium</p>
                <p className="text-[26px] font-bold text-on-background">${suggested.toFixed(2)}<span className="text-[14px] font-semibold text-on-surface-variant">/mo</span></p>
              </div>
            )}
          </div>

          <SeasonChart
            title={`Driest ${observationDays}-day rainfall each season`}
            threshold={thresholdMm}
            points={result.seasons.map((s) => ({
              label: String(s.year),
              value: s.minRainMm,
              triggered: s.triggered,
              detail: `Driest window ended ${s.driestWindowEnd}`,
            }))}
          />

          {mode === 'creator' && (
            <div className="mt-4 text-[13px] text-on-surface-variant space-y-2">
              {lossRatio !== null && (
                <p>
                  At ${premiumUsd?.toFixed(2)}/mo you&apos;d expect to pay out about{' '}
                  <strong className={lossRatio > 1 ? 'text-error' : 'text-on-background'}>${(lossRatio).toFixed(2)} per $1 of premium</strong>
                  {lossRatio > 1 ? ' — that loses money on average.' : '.'}
                </p>
              )}
              <p>
                Suggested = chance × payout × 1.25 margin ÷ {periods} monthly premiums. The chance is smoothed as (hits+1)/(years+2) so a clean record never prices risk at zero.
              </p>
              {onSuggestPremium && suggested !== null && (
                <button
                  type="button"
                  onClick={() => onSuggestPremium(suggested)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/40 text-primary font-bold hover:bg-primary/5"
                >
                  <Sparkles className="w-4 h-4" /> Use ${suggested.toFixed(2)}/mo
                </button>
              )}
            </div>
          )}
          {mode === 'buyer' && (
            <p className="mt-4 text-[12px] text-on-surface-variant">
              Past weather doesn&apos;t guarantee future weather — this is a guide to how the rule behaves here, not a promise.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
