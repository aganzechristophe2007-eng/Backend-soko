import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Bell, BellOff, BellRing, CheckCheck, Loader2, LogIn, MessageCircle, Package, RefreshCw, Wallet,
} from 'lucide-react';
import { api, ApiError } from '../lib/http';
import { disablePush, enablePush, getPushState, PushUiState } from '../lib/push';
import { useAuth } from '../context/Authcontext';
import AuthSheet from './Authsheet';
import { TourHelpButton, useGuidedTour } from '../components/guidedtour';
import { getUnreadCount, setUnreadCount } from '../lib/notificationsStore';
import { NOTIFICATIONS_TOUR } from '../components/guidedtour/tours';
import NotificationAvatar, { NotificationActor } from '../components/NotificationAvatar';
import { notificationKind, resolveNotificationTarget } from '../lib/notificationTarget';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  actor?: NotificationActor | null;
}

type Filter = 'all' | 'unread';

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('fr', { numeric: 'auto' }) : null;

function timeAgo(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (!rtf) return '';
  if (abs < 60) return 'à l’instant';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startToday) return 'Aujourd’hui';
  if (t >= startToday - 6 * 86400000) return 'Cette semaine';
  return 'Plus ancien';
}

const KIND_LABEL: Record<string, string> = {
  order: 'Commande',
  message: 'Message',
  product: 'Nouveau produit',
  shop: 'Nouvelle boutique',
  payment: 'Paiement',
  system: 'CBF SOKO',
};

const PUSH_TEXT: Record<Exclude<PushUiState, 'on' | 'off'>, string> = {
  unsupported: 'Ce navigateur ne gère pas les notifications push. Sur iPhone, ajoutez d’abord CBF SOKO à l’écran d’accueil (Partager > Sur l’écran d’accueil), puis rouvrez cette page. Vos notifications restent visibles ici.',
  unavailable: 'Les notifications push ne sont pas encore disponibles sur ce serveur. Vos notifications restent visibles ici dans l’application.',
  denied: 'Les notifications sont bloquées pour ce site. Pour les autoriser : ouvrez les réglages du site dans votre navigateur (icône à gauche de l’adresse, ou Réglages > Notifications), choisissez « Autoriser », puis revenez ici.',
};

export default function Notifications() {
  const navigate = useNavigate();
  const auth: any = useAuth();
  const user = auth.user;
  const loggedIn = !!user; // les effets dépendent de ce booléen, pas de l'identité de l'objet utilisateur
  const authLoading: boolean = Boolean(auth.loading ?? auth.isLoading ?? false);

  const [showAuth, setShowAuth] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const [push, setPush] = useState<PushUiState | 'checking'>('checking');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 3500);
  }, []);

  /* ------------------------------ Chargement ------------------------------ */
  const load = useCallback(async (currentFilter: Filter, silent = false) => {
    const id = ++requestId.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: NotificationItem[]; nextCursor: string | null; unreadCount: number }>(
        `/notifications?filter=${currentFilter}&limit=20`
      );
      if (id !== requestId.current) return; // une réponse plus récente a pris le relais
      setItems(res.data);
      setNextCursor(res.nextCursor);
      setUnread(res.unreadCount);
      setUnreadCount(res.unreadCount); // met à jour la pastille de l'en-tête et des onglets
    } catch (e) {
      if (id !== requestId.current) return;
      if (e instanceof ApiError && e.status === 401) setShowAuth(true);
      else setError(e instanceof Error ? e.message : 'Impossible de charger les notifications.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!loggedIn) { setLoading(false); return; }
    load(filter);
  }, [loggedIn, authLoading, filter, load]);

  // Rafraîchit quand l'utilisateur revient sur l'onglet (nouvelles notifications reçues entre-temps)
  useEffect(() => {
    if (!loggedIn) return;
    const onVisible = () => { if (document.visibilityState === 'visible') load(filter, true); };
    const onSwMessage = (event: MessageEvent) => { if (event.data?.type === 'cbfsoko:push') load(filter, true); };
    const interval = window.setInterval(onVisible, 30_000); // les nouveautés apparaissent sans recharger la page
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [loggedIn, filter, load]);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    getPushState().then((state) => { if (!cancelled) setPush(state); }).catch(() => { if (!cancelled) setPush('unavailable'); });
    return () => { cancelled = true; };
  }, [loggedIn]);

  /* -------------------------------- Actions -------------------------------- */
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<{ data: NotificationItem[]; nextCursor: string | null; unreadCount: number }>(
        `/notifications?filter=${filter}&limit=20&cursor=${encodeURIComponent(nextCursor)}`
      );
      setItems((prev) => [...prev, ...res.data.filter((n) => !prev.some((p) => p.id === n.id))]);
      setNextCursor(res.nextCursor);
      setUnread(res.unreadCount);
      setUnreadCount(res.unreadCount);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Impossible de charger la suite.');
    } finally {
      setLoadingMore(false);
    }
  };

  const openItem = async (item: NotificationItem) => {
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnread((u) => Math.max(0, u - 1));
      setUnreadCount(getUnreadCount() - 1);
      api(`/notifications/${item.id}/read`, { method: 'PATCH' }).catch(() => {
        // Échec : on rétablit l'état réel plutôt que de mentir à l'utilisateur
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: false } : n)));
        setUnread((u) => u + 1);
        setUnreadCount(getUnreadCount() + 1);
        flash('Impossible de marquer comme lue. Vérifiez votre connexion.');
      });
    }
    const target = resolveNotificationTarget(item);
    if (target) navigate(target);
  };

  const markAll = async () => {
    if (marking || unread === 0) return;
    setMarking(true);
    try {
      await api('/notifications/read-all', { method: 'PATCH' });
      setUnread(0);
      setUnreadCount(0);
      setItems((prev) => (filter === 'unread' ? [] : prev.map((n) => ({ ...n, isRead: true }))));
      flash('Toutes les notifications sont marquées comme lues.');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Action impossible pour le moment.');
    } finally {
      setMarking(false);
    }
  };

  const togglePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (push === 'on') {
        await disablePush();
        setPush(await getPushState());
        setPushMessage('Notifications push désactivées sur cet appareil.');
      } else {
        const result = await enablePush();
        if (result === 'on') {
          setPush(await getPushState()); // on n'affiche « activées » que si le serveur le confirme
          setPushMessage('Notifications push activées sur cet appareil.');
        } else if (result === 'dismissed') {
          setPushMessage('Aucun choix fait : les notifications restent désactivées. Vous pouvez réessayer quand vous voulez.');
        } else {
          setPush(result);
        }
      }
    } catch (e) {
      setPushMessage(e instanceof Error ? e.message : 'Activation impossible pour le moment.');
    } finally {
      setPushBusy(false);
    }
  };

  const sendTest = async () => {
    try {
      const res = await api<{ pushed: number }>('/notifications/test', { method: 'POST' });
      flash(res.pushed > 0 ? 'Test envoyé : regardez votre téléphone.' : 'Notification de test créée dans la liste.');
      load(filter, true);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Test impossible.');
    }
  };

  /* ------------------------------- Tutoriel ------------------------------- */
  const ready = loggedIn && !loading && !error;
  const { start, tour } = useGuidedTour({ id: 'notifications', steps: NOTIFICATIONS_TOUR, ready });

  /* --------------------------------- Rendu --------------------------------- */
  const tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Toutes' },
    { key: 'unread', label: unread > 0 ? `Non lues (${unread})` : 'Non lues' },
  ];

  return (
    <div className="min-h-screen bg-white pb-8 text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            data-tour="notif-back"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#111111] transition-colors hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:brightness-90 lg:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-xl font-bold tracking-tight">Notifications</h1>
          {user && unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              disabled={marking}
              data-tour="notif-readall"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#FF6B00] transition-colors hover:bg-[#FFF1E7] disabled:opacity-60 focus-visible:outline-none focus-visible:brightness-90"
            >
              {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
              <span className="hidden sm:inline">Tout marquer comme lu</span>
              <span className="sm:hidden">Tout lire</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 sm:px-4">
        {!user && !authLoading ? (
          <div className="rounded-xl px-6 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]"><LogIn className="h-7 w-7" aria-hidden="true" /></span>
            <p className="mt-5 text-sm font-bold">Connectez-vous pour voir vos notifications</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#667085]">Commandes, messages et nouveautés de vos vendeurs suivis apparaîtront ici.</p>
            <button type="button" onClick={() => setShowAuth(true)} className="mt-5 rounded-full bg-[#FF6B00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E85F00] focus-visible:outline-none focus-visible:brightness-90">
              Se connecter
            </button>
          </div>
        ) : (
          <>
            {/* Notifications push : toujours facultatif */}
            <section data-tour="notif-push" className="rounded-xl bg-[#F9FAFB] p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
                  {push === 'on' ? <BellRing className="h-5 w-5" aria-hidden="true" /> : push === 'off' || push === 'checking' ? <Bell className="h-5 w-5" aria-hidden="true" /> : <BellOff className="h-5 w-5" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {push === 'on' ? 'Notifications push activées' : 'Recevoir les alertes sur ce téléphone'}
                  </p>
                  {push === 'checking' && <p className="mt-0.5 text-xs text-[#667085]">Vérification en cours…</p>}
                  {push === 'off' && (
                    <p className="mt-0.5 text-xs leading-relaxed text-[#667085]">Facultatif. Votre navigateur vous demandera l’autorisation : touchez « Autoriser ». Vous pouvez refuser, le site fonctionne pareil.</p>
                  )}
                  {push === 'on' && (
                    <p className="mt-0.5 text-xs leading-relaxed text-[#667085]">Cet appareil recevra les alertes de commandes et de nouveaux produits, même site fermé.</p>
                  )}
                  {(push === 'unsupported' || push === 'unavailable' || push === 'denied') && (
                    <p className="mt-0.5 text-xs leading-relaxed text-[#667085]">{PUSH_TEXT[push]}</p>
                  )}
                  {pushMessage && <p role="status" className="mt-1.5 text-xs font-semibold text-[#B54708]">{pushMessage}</p>}
                  {(push === 'off' || push === 'on') && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={togglePush}
                        disabled={pushBusy}
                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:brightness-90 disabled:opacity-60 ${push === 'on' ? 'bg-white text-[#344054]' : 'bg-[#FF6B00] text-white hover:bg-[#E85F00]'}`}
                      >
                        {pushBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {push === 'on' ? 'Désactiver' : 'Activer'}
                      </button>
                      {push === 'on' && (
                        <button type="button" onClick={sendTest} className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#344054] hover:bg-[#FFF1E7] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:brightness-90">
                          Envoyer un test
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button type="button" onClick={() => navigate('/settings/notifications')} className="text-xs font-bold text-[#FF6B00] hover:underline">Choisir les notifications à recevoir</button>
            </div>

            <div role="tablist" aria-label="Filtrer les notifications" data-tour="notif-filters" className="flex gap-2 pb-3">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:brightness-90 ${filter === tab.key ? 'bg-[#111111] text-white' : 'bg-[#F2F4F7] text-[#344054] hover:bg-[#EAECF0]'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loading ? (
              <ul className="space-y-2" aria-busy="true" aria-label="Chargement">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="flex animate-pulse gap-3 p-4">
                    <span className="h-10 w-10 rounded-full bg-[#F2F4F7]" />
                    <span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-[#F2F4F7]" /><span className="block h-3 w-4/5 rounded bg-[#F2F4F7]" /></span>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div role="alert" className="rounded-2xl bg-[#FEF3F2] px-5 py-8 text-center">
                <p className="text-sm font-bold text-[#B42318]">{error}</p>
                <button type="button" onClick={() => load(filter)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white hover:bg-[#333]">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
                </button>
              </div>
            ) : items.length === 0 ? (
              <div data-tour="notif-empty" className="rounded-2xl bg-white px-6 py-14 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]"><Bell className="h-7 w-7" aria-hidden="true" /></span>
                <p className="mt-5 text-sm font-bold">{filter === 'unread' ? 'Tout est lu, bravo !' : 'Aucune notification pour le moment'}</p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#667085]">
                  {filter === 'unread' ? 'Vous n’avez aucune notification non lue.' : 'Vos messages, commandes et paiements apparaîtront ici dès qu’il y aura du nouveau.'}
                </p>
              </div>
            ) : (
              <>
                {(['Aujourd’hui', 'Cette semaine', 'Plus ancien'] as const).map((label) => {
                  const group = items.filter((it) => groupLabel(it.createdAt) === label);
                  if (group.length === 0) return null;
                  return (
                    <section key={label} aria-label={label}>
                      <h2 className="px-1 pb-1 pt-2 text-sm font-bold text-[#111111]">{label}</h2>
                      <ul className="divide-y divide-[#EAECF0] overflow-hidden rounded-xl bg-white">
                        {group.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => openItem(item)}
                              data-tour={items[0]?.id === item.id ? 'notif-item' : undefined}
                              aria-label={`${item.isRead ? '' : 'Non lue. '}${item.title}. ${item.message}`}
                              className={`flex min-h-[72px] w-full items-center gap-3 px-3 py-3 text-left transition-colors focus-visible:bg-[#EAECF0] focus-visible:outline-none ${item.isRead ? 'bg-white hover:bg-[#F9FAFB]' : 'bg-[#FFF8F3] hover:bg-[#FFF1E7]'}`}
                            >
                              <NotificationAvatar actor={item.actor} size={52} />
                              <span className="min-w-0 flex-1">
                                <span className={`block text-sm leading-snug ${item.isRead ? 'font-medium' : 'font-bold'}`}>{item.title}</span>
                                <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-[#667085]">{item.message}</span>
                                <span className="mt-1 flex items-center gap-2 text-[11px]">
                                  <span className={`rounded-full px-2 py-0.5 font-semibold ${item.isRead ? 'bg-[#F2F4F7] text-[#667085]' : 'bg-[#FFE4D1] text-[#C94F00]'}`}>{KIND_LABEL[notificationKind(item)]}</span>
                                  <time dateTime={item.createdAt} className={item.isRead ? 'text-[#667085]' : 'font-semibold text-[#FF6B00]'}>{timeAgo(item.createdAt)}</time>
                                </span>
                              </span>
                              {!item.isRead && <span aria-hidden="true" className="h-3 w-3 flex-shrink-0 rounded-full bg-[#FF6B00]" />}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
                {nextCursor && (
                  <button type="button" onClick={loadMore} disabled={loadingMore} className="mx-auto flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold text-[#344054] hover:bg-[#FFF1E7] hover:text-[#FF6B00] disabled:opacity-60">
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Voir plus
                  </button>
                )}
              </>
            )}
          </>
        )}
      </main>

      {notice && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {notice}
        </div>
      )}

      {user && <TourHelpButton onClick={start} />}
      {tour}

      <AnimatePresence>
        {showAuth && (
          <AuthSheet
            onClose={() => setShowAuth(false)}
            onSuccess={(nextUser: any) => { auth.login(nextUser); setShowAuth(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
