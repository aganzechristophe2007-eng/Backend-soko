import { api } from './http';

/**
 * Notifications push (Web Push) : tout est explicite et vérifié.
 * Le site n'affiche « activées » que si le navigateur ET le serveur confirment l'abonnement.
 */

export type PushUiState =
  | 'unsupported' // navigateur sans Service Worker / Push (ex. iPhone hors écran d'accueil)
  | 'unavailable' // le serveur n'a pas de clés VAPID configurées
  | 'denied' // l'utilisateur a bloqué les notifications dans le navigateur
  | 'off' // possible, pas encore activé
  | 'on'; // activé et confirmé par le serveur

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(new ArrayBuffer(raw.length)); // ArrayBuffer (et non SharedArrayBuffer) exigé par pushManager.subscribe
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushUiState> {
  if (!isPushSupported()) return 'unsupported';
  let config: { enabled: boolean };
  try {
    config = await api('/push/config');
  } catch {
    return 'unavailable';
  }
  if (!config.enabled) return 'unavailable';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const sub = await currentSubscription();
    if (sub && Notification.permission === 'granted') {
      const status = await api<{ subscribed: boolean }>('/push/status', { method: 'POST', body: { endpoint: sub.endpoint } });
      if (status.subscribed) return 'on';
    }
  } catch {
    /* non connecté ou réseau : on retombe sur « off », jamais sur « on » */
  }
  return 'off';
}

export type EnablePushResult = 'on' | 'denied' | 'dismissed' | 'unavailable' | 'unsupported';

export async function enablePush(): Promise<EnablePushResult> {
  if (!isPushSupported()) return 'unsupported';
  const config = await api<{ enabled: boolean; publicKey: string | null }>('/push/config');
  if (!config.enabled || !config.publicKey) return 'unavailable';

  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'dismissed'; // fenêtre fermée sans choisir

  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource }));

  try {
    await api('/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), userAgent: navigator.userAgent } });
  } catch (error) {
    await subscription.unsubscribe().catch(() => undefined); // pas d'abonnement fantôme si le serveur refuse
    throw error;
  }
  return 'on';
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
