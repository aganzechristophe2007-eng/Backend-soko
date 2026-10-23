import { useEffect, useSyncExternalStore } from 'react';
import { api } from './http';

/**
 * Compteur de notifications non lues, partagé entre toute l'application (en-tête, onglets, page Notifications).
 * Source de vérité : le serveur (/api/notifications/unread-count). Le compteur est rafraîchi :
 *  - au chargement et toutes les 45 s quand l'onglet est visible,
 *  - au retour sur l'onglet / la fenêtre,
 *  - à la réception d'un push (message du service worker),
 *  - immédiatement par la page Notifications (setUnreadCount) quand l'utilisateur lit des notifications.
 */

let count = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const getUnreadCount = () => count;

export function setUnreadCount(next: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
  if (value !== count) {
    count = value;
    emit();
  }
}

export async function refreshUnreadCount(): Promise<void> {
  try {
    const res = await api<{ unreadCount: number }>('/notifications/unread-count');
    setUnreadCount(res.unreadCount);
  } catch {
    /* non connecté ou réseau coupé : on garde la dernière valeur connue */
  }
}

/** `enabled` = utilisateur connecté. Retourne le nombre de notifications non lues (0 si déconnecté). */
export function useUnreadNotifications(enabled: boolean): number {
  const value = useSyncExternalStore(subscribe, getUnreadCount, () => 0);

  useEffect(() => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }
    refreshUnreadCount();
    const refreshIfVisible = () => { if (document.visibilityState === 'visible') refreshUnreadCount(); };
    const interval = window.setInterval(refreshIfVisible, 45_000);
    const onSwMessage = (event: MessageEvent) => { if (event.data?.type === 'cbfsoko:push') refreshUnreadCount(); };
    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('focus', refreshIfVisible);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [enabled]);

  return enabled ? value : 0;
}
