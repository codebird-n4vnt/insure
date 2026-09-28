'use client';

import { useEffect, useRef, useState } from 'react';

/** Validated with the dataviz palette checker: CVD-separable, >=3:1 on white. */
export const CHART = { base: '#00897b', trigger: '#c2601a', grid: '#e3e8e6', axis: '#66757d', ink: '#26343d' };

function useWidth<T extends HTMLElement>(fallback = 300) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const fmtMm = (v: number) => `${(Math.abs(v) < 0.05 ? 0 : v).toLocaleString('en-US', { maximumFractionDigits: 1 })} mm`;

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x - 90, 0), width - 180);
  return (
    <div
      className="absolute pointer-events-none bg-surface-container-lowest border border-outline-variant rounded-[10px] shadow-lg px-3 py-2 text-[12px] w-[180px]"
      style={{ left, top: Math.max(y - 64, 0) }}
    >
      {children}
    </div>
  );
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="text-[12px] font-semibold text-primary hover:underline">
      {open ? 'Hide table' : 'Show as table'}
    </button>
  );
}

// ─── Season columns: driest N-day rainfall per year vs threshold ───────────

export interface SeasonPoint {
  label: string;
  value: number;
  triggered: boolean;
  detail?: string;
}

export function SeasonChart({ points, threshold, title }: { points: SeasonPoint[]; threshold: number; title: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const height = 220;
  const m = { top: 24, right: 12, bottom: 28, left: 52 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const max = niceMax(Math.max(threshold * 1.25, ...points.map((p) => p.value)));
  const y = (v: number) => m.top + ih - (v / max) * ih;
  const band = iw / Math.max(points.length, 1);
  const barW = Math.min(24, band - 2);
  const ticks = [0, max / 2, max];
  const anyTriggered = points.some((p) => p.triggered);

  return (
    <figure className="w-full min-w-0">
      <figcaption className="flex items-center justify-between gap-4 mb-2">
        <span className="text-[13px] font-semibold text-on-background">{title}</span>
        <TableToggle open={table} onToggle={() => setTable(!table)} />
      </figcaption>
      <div className="flex flex-wrap gap-4 text-[12px] text-on-surface-variant mb-1" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART.base }} />No payout</span>
        {anyTriggered && <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART.trigger }} />Would have paid out</span>}
        <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[2px]" style={{ background: CHART.ink }} />Threshold {fmtMm(threshold)}</span>
      </div>
      <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${points.filter((p) => p.triggered).length} of ${points.length} seasons below the ${threshold} mm threshold.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.axis} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const cx = m.left + band * i + band / 2;
            const top = y(p.value);
            const h = Math.max(m.top + ih - top, 1);
            const r = Math.min(4, h, barW / 2);
            const x0 = cx - barW / 2;
            const path = `M${x0},${m.top + ih} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${m.top + ih} Z`;
            return (
              <g
                key={p.label}
                tabIndex={0}
                role="listitem"
                aria-label={`${p.label}: ${fmtMm(p.value)}${p.triggered ? ', would have paid out' : ''}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="outline-none"
              >
                <rect x={cx - band / 2} y={m.top} width={band} height={ih} fill="transparent" />
                <path d={path} fill={p.triggered ? CHART.trigger : CHART.base} opacity={hover === null || hover === i ? 1 : 0.55} />
                {p.triggered && (
                  <text x={cx} y={top - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill={CHART.ink}>
                    Payout
                  </text>
                )}
                {(points.length <= 12 || i % 2 === 0) && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART.axis}>
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={m.left} x2={width - m.right} y1={y(threshold)} y2={y(threshold)} stroke={CHART.ink} strokeWidth={2} />
          <text x={m.left} y={m.top - 8} fontSize={11} fill={CHART.axis}>mm</text>
        </svg>
        {hover !== null && (
          <Tooltip x={m.left + band * hover + band / 2} y={y(points[hover].value)} width={width}>
            <p className="font-bold text-on-background">{fmtMm(points[hover].value)}</p>
            <p className="text-on-surface-variant">{points[hover].label}{points[hover].triggered ? ' · would have paid' : ''}</p>
            {points[hover].detail && <p className="text-on-surface-variant">{points[hover].detail}</p>}
          </Tooltip>
        )}
      </div>
      {table && (
        <table className="w-full mt-3 text-[13px]">
          <thead><tr className="text-left text-on-surface-variant"><th className="py-1">Season</th><th>Driest window</th><th>Payout?</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t border-outline-variant">
                <td className="py-1">{p.label}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMm(p.value)}</td>
                <td>{p.triggered ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}

// ─── Cumulative rainfall over the observation window vs threshold ─────────

export function CumulativeRainChart({ days, threshold }: { days: { date: string; mm: number }[]; threshold: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const cum: number[] = [];
  days.reduce((s, d, i) => (cum[i] = s + d.mm), 0);
  const height = 220;
  const m = { top: 24, right: 16, bottom: 28, left: 52 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const max = niceMax(Math.max(threshold * 1.2, ...cum));
  const x = (i: number) => m.left + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => m.top + ih - (v / max) * ih;
  const line = cum.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L${x(cum.length - 1)},${m.top + ih} L${x(0)},${m.top + ih} Z`;
  const final = cum[cum.length - 1] ?? 0;
  const ticks = [0, max / 2, max];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - m.left) / iw) * (days.length - 1));
    setHover(Math.min(Math.max(i, 0), days.length - 1));
  };

  return (
    <figure className="w-full min-w-0">
      <figcaption className="flex items-center justify-between gap-4 mb-2">
        <span className="text-[13px] font-semibold text-on-background">Cumulative rainfall over the {days.length}-day window</span>
        <TableToggle open={table} onToggle={() => setTable(!table)} />
      </figcaption>
      <div ref={ref} className="relative w-full min-w-0 overflow-hidden">
        <svg
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Rainfall reached ${fmtMm(final)} against a ${threshold} mm threshold.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
              <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.axis}>{Math.round(t)}</text>
            </g>
          ))}
          <path d={area} fill={CHART.base} opacity={0.1} />
          <path d={line} fill="none" stroke={CHART.base} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <line x1={m.left} x2={width - m.right} y1={y(threshold)} y2={y(threshold)} stroke={CHART.ink} strokeWidth={2} />
          <text x={width - m.right} y={y(threshold) - 6} textAnchor="end" fontSize={11} fontWeight={600} fill={CHART.ink}>
            Threshold {fmtMm(threshold)}
          </text>
          {days.length > 0 && (
            <>
              <circle cx={x(days.length - 1)} cy={y(final)} r={4} fill={CHART.base} stroke="#fff" strokeWidth={2} />
              <text x={x(days.length - 1) - 8} y={y(final) + (y(final) > y(threshold) ? 16 : -8)} textAnchor="end" fontSize={11} fontWeight={700} fill={CHART.ink}>
                {fmtMm(final)}
              </text>
              <text x={m.left} y={height - 8} fontSize={11} fill={CHART.axis}>{days[0].date}</text>
              <text x={width - m.right} y={height - 8} textAnchor="end" fontSize={11} fill={CHART.axis}>{days[days.length - 1].date}</text>
            </>
          )}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + ih} stroke={CHART.axis} strokeWidth={1} />
              <circle cx={x(hover)} cy={y(cum[hover])} r={4} fill={CHART.base} stroke="#fff" strokeWidth={2} />
            </>
          )}
          <text x={m.left} y={m.top - 8} fontSize={11} fill={CHART.axis}>mm</text>
        </svg>
        {hover !== null && (
          <Tooltip x={x(hover)} y={y(cum[hover])} width={width}>
            <p className="font-bold text-on-background">{fmtMm(cum[hover])} total</p>
            <p className="text-on-surface-variant">{days[hover].date} · {fmtMm(days[hover].mm)} that day</p>
          </Tooltip>
        )}
      </div>
      {table && (
        <div className="max-h-64 overflow-y-auto mt-3">
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-on-surface-variant"><th className="py-1">Date</th><th>Rain</th><th>Running total</th></tr></thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d.date} className="border-t border-outline-variant" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <td className="py-1">{d.date}</td><td>{fmtMm(d.mm)}</td><td>{fmtMm(cum[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
