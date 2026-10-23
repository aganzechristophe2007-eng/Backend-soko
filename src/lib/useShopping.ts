import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Favoris persistés en base (/api/favorites) pour l'utilisateur connecté. */
export function useFavorites(isLoggedIn: boolean) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isLoggedIn) { setIds([]); return; }
    let alive = true;
    api<{ ids: string[] }>('/favorites').then((r) => { if (alive) setIds(r.ids); }).catch(() => undefined);
    return () => { alive = false; };
  }, [isLoggedIn]);

  /** Bascule avec mise à jour optimiste ; renvoie le nouvel état, ou lève une erreur (et annule l'optimisme). */
  const toggle = useCallback(async (productId: string): Promise<boolean> => {
    setIds((prev) => (prev.includes(productId) ? prev.filter((i) => i !== productId) : [productId, ...prev]));
    try {
      const res = await api<{ favorite: boolean }>(`/favorites/${productId}/toggle`, { method: 'POST' });
      setIds((prev) => {
        const has = prev.includes(productId);
        if (res.favorite && !has) return [productId, ...prev];
        if (!res.favorite && has) return prev.filter((i) => i !== productId);
        return prev;
      });
      return res.favorite;
    } catch (e) {
      setIds((prev) => (prev.includes(productId) ? prev.filter((i) => i !== productId) : [productId, ...prev]));
      throw e;
    }
  }, []);

  return { ids, isFavorite: (id: string) => ids.includes(id), toggle };
}

/** Compteur du panier + ajout (table CartItem, via /api/cart-items). */
export function useCart(isLoggedIn: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) { setCount(0); return; }
    let alive = true;
    api<{ count: number }>('/cart-items/count').then((r) => { if (alive) setCount(r.count); }).catch(() => undefined);
    return () => { alive = false; };
  }, [isLoggedIn]);

  const add = useCallback(async (productId: string, quantity = 1) => {
    const res = await api<{ count: number; capped: boolean }>('/cart-items', { method: 'POST', body: { productId, quantity } });
    setCount(res.count);
    return res;
  }, []);

  return { count, add };
}
