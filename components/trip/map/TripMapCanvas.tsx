'use client';

import { useEffect, useRef, useState } from 'react';
import { API_KEY, loadMaps, geocode, type Waypoint } from './mapLoader';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  waypoints: Waypoint[];
  height?: number;
}

export function TripMapCanvas({ waypoints, height = 280 }: Props) {
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
        });

        const bounds = new window.google.maps.LatLngBounds();
        const path: { lat: number; lng: number }[] = [];

        for (let i = 0; i < waypoints.length; i++) {
          if (cancelled) break;
          const pos = waypoints[i].position ?? await geocode(waypoints[i].query);
          if (!pos || cancelled) continue;

          new window.google.maps.Marker({
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
