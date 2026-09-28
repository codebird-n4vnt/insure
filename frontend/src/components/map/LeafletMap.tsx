'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface Box {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface LeafletMapProps {
  point: { lat: number; lon: number } | null;
  onPick?: (lat: number, lon: number) => void;
  box?: Box | null;
  /** Fit the view to the box (vault page) instead of the point */
  fitBox?: boolean;
  height?: number;
}

const TEAL = '#2c6e6a';

/** Only ever loaded client-side (Leaflet needs `window`); see MapPicker. */
export default function LeafletMap({ point, onPick, box, fitBox, height = 320 }: LeafletMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const rect = useRef<L.Rectangle | null>(null);
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: [20.6, 78.9], zoom: 4, scrollWheelZoom: false, worldCopyJump: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      const lon = ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180;
      pickRef.current?.(Number(e.latlng.lat.toFixed(5)), Number(lon.toFixed(5)));
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    rect.current?.remove();
    rect.current = null;
    if (box) {
      rect.current = L.rectangle(
        [[box.minLat, box.minLon], [box.maxLat, box.maxLon]],
        { color: TEAL, weight: 2, fillOpacity: 0.08, interactive: false }
      ).addTo(m);
      // Always frame the region, so picking a centre or a size shows exactly what's covered.
      m.fitBounds(rect.current.getBounds(), { padding: [40, 40], animate: false });
    }
  }, [box?.minLat, box?.maxLat, box?.minLon, box?.maxLon, fitBox]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!point) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = L.circleMarker([point.lat, point.lon], {
        radius: 8, color: '#ffffff', weight: 2, fillColor: TEAL, fillOpacity: 1,
      }).addTo(m);
    } else marker.current.setLatLng([point.lat, point.lon]);
    // With a region box, the box effect owns the framing; just keep the pin in view.
    if (box) {
      if (!m.getBounds().contains([point.lat, point.lon])) m.panTo([point.lat, point.lon]);
    } else {
      m.setView([point.lat, point.lon], Math.max(m.getZoom(), 7));
    }
  }, [point?.lat, point?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} style={{ height }} className="w-full z-0 border border-outline-variant" aria-label="Map: click to choose a location" />;
}
