'use client';

import { useEffect, useRef, useState } from 'react';
import { API_KEY, loadMaps, geocode, type Waypoint } from './mapLoader';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  waypoints: Waypoint[];
  height?: number;
  selectedId?: string;
  onSelect?: (id: string | null) => void;
}

export function TripMapCanvas({ waypoints, height = 280, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!API_KEY || !mapRef.current || waypoints.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await loadMaps();
        if (cancelled || !mapRef.current) return;

        const map = new window.google.maps.Map(mapRef.current, {
          zoom: 10,
          center: { lat: 0, lng: 0 },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });

        const transitLayer = new window.google.maps.TransitLayer();
        transitLayer.setMap(map);

        const bounds = new window.google.maps.LatLngBounds();
        const path: { lat: number; lng: number }[] = [];
        const infoWindow = new window.google.maps.InfoWindow();

        map.addListener('click', () => {
          infoWindow.close();
          onSelect?.(null);
        });

        // Resolve all positions first so we can detect and offset duplicates
        const resolved: ({ lat: number; lng: number } | null)[] = [];
        for (let i = 0; i < waypoints.length; i++) {
          if (cancelled) break;
          resolved.push(waypoints[i].position ?? await geocode(waypoints[i].query));
        }

        // Count how many markers land on each position
        const posKey = (p: { lat: number; lng: number }) =>
          `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
        const groupCount: Record<string, number> = {};
        const groupIndex: Record<string, number> = {};
        for (const pos of resolved) {
          if (pos) groupCount[posKey(pos)] = (groupCount[posKey(pos)] ?? 0) + 1;
        }

        // Spread duplicates in a small circle (~15 m radius)
        const OFFSET_DEG = 0.00013; // ~15 m
        const offsetPos = (pos: { lat: number; lng: number }, key: string) => {
          const total = groupCount[key];
          if (total <= 1) return pos;
          const idx = groupIndex[key] ?? 0;
          groupIndex[key] = idx + 1;
          const angle = (2 * Math.PI * idx) / total;
          return {
            lat: pos.lat + OFFSET_DEG * Math.sin(angle),
            lng: pos.lng + OFFSET_DEG * Math.cos(angle),
          };
        };

        for (let i = 0; i < waypoints.length; i++) {
          if (cancelled) break;
          const rawPos = resolved[i];
          if (!rawPos || cancelled) continue;

          const pos = offsetPos(rawPos, posKey(rawPos));

          const gmMarker = new window.google.maps.Marker({
            map,
            position: pos,
            title: waypoints[i].label,
            label: {
              text: String(i + 1),
              color: '#111827',
              fontWeight: 'bold',
              fontSize: '12px',
            },
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: '#FACC15',
              fillOpacity: 1,
              strokeColor: '#111827',
              strokeWeight: 1.5,
            },
          });

          const wp = waypoints[i];
          gmMarker.addListener('click', () => {
            infoWindow.setContent(
              `<div style="font-family:Inter,sans-serif;padding:2px 4px;max-width:200px">` +
              `<strong style="font-size:13px;color:#111827">${wp.label}</strong>` +
              (wp.detail
                ? `<br/><span style="font-size:12px;color:#64748b">${wp.detail}</span>`
                : '') +
              `</div>`,
            );
            infoWindow.open(map, gmMarker);
            onSelect?.(wp.id ?? null);
          });

          bounds.extend(pos);
          path.push(pos);
        }

        if (path.length >= 2 && !cancelled) {
          new window.google.maps.Polyline({
            map,
            path,
            geodesic: true,
            strokeColor: '#1d4ed8',
            strokeOpacity: 0.75,
            strokeWeight: 2.5,
          });
        }

        if (path.length > 0 && !cancelled) {
          map.fitBounds(bounds);
          if (path.length === 1) map.setZoom(12);
        }

        setLoading(false);
      } catch {
        if (!cancelled) setError('Could not load map.');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!API_KEY || waypoints.length === 0) return null;

  return (
    <div className="relative" style={{ height }}>
      <div ref={mapRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
          <p className="type-caption text-text-muted">Loading map…</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="type-caption text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
