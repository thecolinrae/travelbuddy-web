/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { google: any }
}

export const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

let scriptPromise: Promise<void> | null = null;

export function loadMaps(): Promise<void> {
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

export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
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

export interface Waypoint {
  /** Short display label shown in the legend (e.g. "Austin", "NRT") */
  label: string;
  /** Geocoding query — may be the same as label or a more specific string */
  query: string;
  /** Pre-resolved coordinates — if present, geocoding is skipped entirely */
  position?: { lat: number; lng: number };
  /** Item ID used to sync pin clicks with the day list */
  id?: string;
  /** Optional subtitle shown in the pin popup (e.g. street address) */
  detail?: string;
}
