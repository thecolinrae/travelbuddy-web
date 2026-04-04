'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from 'react';
import { API_KEY, loadMaps, geocode } from './mapLoader';

export interface MapMarker {
  id: string;
  label: string;
  detail?: string;
  query: string;
  position?: { lat: number; lng: number };
  color: string;
  legendLabel: string;
  /** Inner SVG elements (paths, lines, etc.) from a 24×24 Lucide icon */
  iconInnerSvg?: string;
}

interface Props {
  markers: MapMarker[];
  cityName: string;
  height?: number;
}

/**
 * Build a Google Maps Icon from a colored circle with a white Lucide icon inside.
 * Falls back to a plain colored circle if no iconInnerSvg is provided.
 */
function buildMarkerIcon(color: string, iconInnerSvg: string | undefined): object {
  if (!iconInnerSvg) {
    return {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 14,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    };
  }

  // 32×32 SVG: circle background + icon scaled to 0.8× (≈19px) centered inside
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2"/>` +
    `<g transform="translate(6,6) scale(0.8)" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    iconInnerSvg +
    `</g>` +
    `</svg>`;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 16),
  };
}

export function CityMapCanvas({ markers, cityName, height = 420 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!API_KEY || !mapRef.current) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await loadMaps();
        if (cancelled || !mapRef.current) return;

        const map = new window.google.maps.Map(mapRef.current, {
          zoom: 13,
          center: { lat: 0, lng: 0 },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
        });

        // Show subway / bus / rail lines
        const transitLayer = new window.google.maps.TransitLayer();
        transitLayer.setMap(map);

        const bounds = new window.google.maps.LatLngBounds();
        const infoWindow = new window.google.maps.InfoWindow();
        let resolved = 0;

        for (const marker of markers) {
          if (cancelled) break;

          const pos = marker.position ?? (await geocode(marker.query));
          if (!pos || cancelled) continue;

          resolved++;
          bounds.extend(pos);

          const gmMarker = new window.google.maps.Marker({
            map,
            position: pos,
            title: marker.label,
            icon: buildMarkerIcon(marker.color, marker.iconInnerSvg),
          });

          gmMarker.addListener('click', () => {
            infoWindow.setContent(
              `<div style="font-family:Inter,sans-serif;font-size:13px;max-width:200px">` +
              `<strong style="font-size:14px">${marker.label}</strong>` +
              (marker.detail ? `<br/><span style="color:#64748b">${marker.detail}</span>` : '') +
              `</div>`,
            );
            infoWindow.open(map, gmMarker);
          });
        }

        if (resolved === 0 && !cancelled) {
          const cityPos = await geocode(cityName);
          if (cityPos && !cancelled) {
            map.setCenter(cityPos);
            map.setZoom(13);
          }
        } else if (!cancelled) {
          map.fitBounds(bounds);
          if (resolved === 1) map.setZoom(14);
        }

        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Could not load map.');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers.map((m) => m.id).join(','), cityName]);

  if (!API_KEY) return null;

  return (
    <div className="relative rounded-xl overflow-hidden border" style={{ height }}>
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
