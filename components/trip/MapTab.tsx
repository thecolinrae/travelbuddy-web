'use client';

import { useEffect, useRef, useState } from 'react';
import type { TimelineEvent, HotelCheckInEvent, ActivityEvent } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { google: any }
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

let scriptPromise: Promise<void> | null = null;

function loadMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Maps'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

interface MapLocation {
  label: string;
  query: string;
  type: 'hotel' | 'activity' | 'city';
}

interface Props {
  timeline: TimelineEvent[];
}

export function MapTab({ timeline }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Collect unique locations
  const locations: MapLocation[] = [];
  const seen = new Set<string>();

  for (const e of timeline) {
    let label = '';
    let query = '';
    let type: MapLocation['type'] = 'city';

    if (e.type === 'hotel' && e.subtype === 'check_in') {
      const ev = e as HotelCheckInEvent;
      label = `🏨 ${ev.hotelName}`;
      query = `${ev.hotelName}, ${ev.locationCity}`;
      type = 'hotel';
    } else if (e.type === 'activity') {
      const ev = e as ActivityEvent;
      label = `🎭 ${ev.description}`;
      query = ev.locationAddress
        ? `${ev.locationAddress}, ${ev.locationCity}`
        : ev.locationCity;
      type = 'activity';
    }

    if (label && !seen.has(label)) {
      seen.add(label);
      locations.push({ label, query, type });
    }
  }

  // Fallback: use unique cities from any event
  if (locations.length === 0) {
    const cities = [...new Set(timeline.map((e) => e.locationCity).filter(Boolean))];
    for (const city of cities.slice(0, 3)) {
      locations.push({ label: `📍 ${city}`, query: city, type: 'city' });
    }
  }

  useEffect(() => {
    if (!API_KEY || !mapRef.current || locations.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await loadMaps();
        if (cancelled || !mapRef.current) return;

        const map = new window.google.maps.Map(mapRef.current, {
          zoom: 12,
          center: { lat: 0, lng: 0 },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        const bounds = new window.google.maps.LatLngBounds();
        let hasPoints = false;

        // Geocode up to 8 locations (rate-limit friendly)
        const toGeocode = locations.slice(0, 8);
        for (const loc of toGeocode) {
          if (cancelled) break;
          const pos = await geocode(loc.query);
          if (!pos || cancelled) continue;

          const marker = new window.google.maps.Marker({
            map,
            position: pos,
            title: loc.label,
          });

          const infoWindow = new window.google.maps.InfoWindow({
            content: `<div style="font-size:13px;padding:2px 4px">${loc.label}</div>`,
          });

          marker.addListener('click', () => infoWindow.open(map, marker));
          bounds.extend(pos);
          hasPoints = true;
        }

        if (hasPoints && !cancelled) {
          map.fitBounds(bounds);
          if (toGeocode.length === 1) map.setZoom(13);
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

  if (!API_KEY) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Google Maps API key not configured.
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No locations found in the timeline.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-xl overflow-hidden border" style={{ height: 400 }}>
        <div ref={mapRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
            <p className="text-sm text-muted-foreground">Loading map…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>

      <ul className="space-y-1.5">
        {locations.map((loc, i) => (
          <li key={i} className="rounded-lg border bg-card px-4 py-2.5 text-sm">
            {loc.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
