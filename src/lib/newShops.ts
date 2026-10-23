import { useEffect, useState } from 'react';
import { api } from './http';

/**
 * « Nouvelles boutiques » : une boutique est nouvelle si elle a été créée depuis la dernière visite
 * de la page Boutique (mémorisée dans ce navigateur). Première visite : boutiques des 7 derniers jours.
 */

const KEY = 'cbfsoko:shops:lastSeen:v1';
const EVENT = 'cbfsoko:shops-seen';
const WEEK = 7 * 24 * 3600 * 1000;

export function readShopsLastSeen(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** À appeler quand l'utilisateur a vu la liste des boutiques : remet le badge à zéro. */
export function markShopsSeen() {
  try { window.localStorage.setItem(KEY, String(Date.now())); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(EVENT));
}

export function shopsSince(): number {
  return readShopsLastSeen() ?? Date.now() - WEEK;
}

export function useNewShopsCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api<{ count: number }>(`/shops/new-count?since=${encodeURIComponent(new Date(shopsSince()).toISOString())}`)
        .then((res) => { if (!cancelled) setCount(res.count || 0); })
        .catch(() => { if (!cancelled) setCount(0); });
    };
    const onSeen = () => setCount(0);
    load();
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 5 * 60 * 1000);
    window.addEventListener(EVENT, onSeen);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(EVENT, onSeen);
    };
  }, []);

  return count;
}
