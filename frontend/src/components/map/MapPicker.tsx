'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { searchPlaces, type Place } from '@/lib/backtest';
import type { Box } from './LeafletMap';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="skeleton w-full" style={{ height: 320 }} />,
});

export type { Box };

interface Props {
  point: { lat: number; lon: number } | null;
  onChange: (lat: number, lon: number) => void;
  box?: Box | null;
  fitBox?: boolean;
  placeholder?: string;
  height?: number;
}

/** Place search + "use my location" + click-to-pick map. */
export default function MapPicker({ point, onChange, box, fitBox, placeholder = 'Search a village, town or district…', height }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const seq = useRef(0);
  // The label of the place just picked; don't search for it again.
  const picked = useRef('');

  useEffect(() => {
    if (q.trim().length < 2 || q === picked.current) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchPlaces(q);
        if (id === seq.current) setResults(r);
      } catch {
        if (id === seq.current) setResults([]);
      } finally {
        if (id === seq.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const locate = () => {
    if (!navigator.geolocation) return setGeoError('Location is not available in this browser.');
    setLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        onChange(Number(p.coords.latitude.toFixed(5)), Number(p.coords.longitude.toFixed(5)));
      },
      (e) => {
        setLocating(false);
        setGeoError(e.code === e.PERMISSION_DENIED ? 'Location permission denied.' : 'Could not get your location.');
      },
      { timeout: 10_000 }
    );
  };

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            placeholder={placeholder}
            aria-label="Search for a place"
            className="w-full pl-11 pr-10 py-3 rounded-full border border-outline-variant bg-surface-container-low focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-background text-[14px]"
          />
          {searching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
          {results.length > 0 && (
            <ul className="absolute z-20 mt-2 w-full bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-lg overflow-hidden" role="listbox">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const label = `${r.name}${r.detail ? `, ${r.detail}` : ''}`;
                      picked.current = label;
                      seq.current++; // drop any in-flight search
                      onChange(Number(r.lat.toFixed(5)), Number(r.lon.toFixed(5)));
                      setResults([]);
                      setQ(label);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-surface-container-low flex items-start gap-2"
                  >
                    <MapPin className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                    <span className="text-[14px]">
                      <span className="font-semibold text-on-background">{r.name}</span>
                      {r.detail && <span className="text-on-surface-variant"> · {r.detail}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={locate}
          className="px-5 py-3 rounded-full font-bold border border-outline-variant text-on-background hover:border-primary/40 flex items-center justify-center gap-2 text-[14px] whitespace-nowrap"
        >
          {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />} Use my location
        </button>
      </div>
      {geoError && <p className="text-[12px] text-error">{geoError}</p>}
      <LeafletMap point={point} onPick={onChange} box={box} fitBox={fitBox} height={height} />
      <p className="text-[12px] text-on-surface-variant">
        {point ? `Selected ${point.lat.toFixed(4)}°, ${point.lon.toFixed(4)}°` : 'Search, use your location, or click the map.'}
      </p>
    </div>
  );
}
