import { useCallback, useEffect, useState } from 'react';
import { api } from './http';

/** Préférences stockées côté serveur (voir /api/settings/preferences). */
export interface Preferences {
  privacy: { profileVisibility: 'everyone' | 'members'; allowMessagesFromStrangers: boolean };
  notifications: { orders: boolean; messages: boolean; products: boolean; shops: boolean; payments: boolean };
  shop: { vacationMode: boolean; vacationNote: string };
  delivery: { recipientName: string; phone: string; city: string; commune: string; quarter: string; address: string; landmark: string };
}

export interface AccountState {
  status: 'ACTIVE' | 'PAUSED' | 'PENDING_DELETION' | 'DELETED';
  pausedAt: string | null;
  deletionScheduledAt: string | null;
  daysLeft: number | null;
}

export type PreferencesPatch = { [K in keyof Preferences]?: Partial<Preferences[K]> };

export const EMPTY_PREFERENCES: Preferences = {
  privacy: { profileVisibility: 'everyone', allowMessagesFromStrangers: true },
  notifications: { orders: true, messages: true, products: true, shops: true, payments: true },
  shop: { vacationMode: false, vacationNote: '' },
  delivery: { recipientName: '', phone: '', city: '', commune: '', quarter: '', address: '', landmark: '' },
};

/** Charge les préférences et expose `save` (enregistrement immédiat, annulé si le serveur refuse). */
export function usePreferences(user?: unknown) {
  const enabled = Boolean(user);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ data: Preferences; account: AccountState }>('/settings/preferences');
      setPrefs(res.data);
      setAccount(res.account);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger vos paramètres.');
    }
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);

  const save = useCallback(
    async (patch: PreferencesPatch): Promise<boolean> => {
      const before = prefs;
      if (before) {
        setPrefs({
          privacy: { ...before.privacy, ...(patch.privacy ?? {}) },
          notifications: { ...before.notifications, ...(patch.notifications ?? {}) },
          shop: { ...before.shop, ...(patch.shop ?? {}) },
          delivery: { ...before.delivery, ...(patch.delivery ?? {}) },
        });
      }
      try {
        const res = await api<{ data: Preferences }>('/settings/preferences', { method: 'PATCH', body: patch });
        setPrefs(res.data);
        return true;
      } catch (e) {
        if (before) setPrefs(before);
        setError(e instanceof Error ? e.message : 'Enregistrement impossible.');
        return false;
      }
    },
    [prefs],
  );

  return { prefs, account, setAccount, error, setError, save, reload: load };
}
