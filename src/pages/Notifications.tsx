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

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
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

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-5 w-5';
  if (type === 'ORDER') return <Package className={cls} aria-hidden="true" />;
  if (type === 'MESSAGE' || type === 'COMMENT') return <MessageCircle className={cls} aria-hidden="true" />;
  if (type === 'PAYMENT') return <Wallet className={cls} aria-hidden="true" />;
  return <Bell className={cls} aria-hidden="true" />;
}

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
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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
    if (item.link && item.link.startsWith('/') && !item.link.startsWith('//')) navigate(item.link);
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
    <div className="min-h-screen bg-white pb-24 text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            data-tour="notif-back"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-base font-bold tracking-tight sm:text-lg">Notifications</h1>
          {user && unread > 0 && (
            <button
              type="button"
              onClick={markAll}
              disabled={marking}
              data-tour="notif-readall"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#EAECF0] px-3 py-2 text-xs font-semibold text-[#344054] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
            >
              {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
              <span className="hidden sm:inline">Tout marquer comme lu</span>
              <span className="sm:hidden">Tout lire</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {!user && !authLoading ? (
          <div className="rounded-2xl border border-dashed border-[#D0D5DD] px-6 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]"><LogIn className="h-7 w-7" aria-hidden="true" /></span>
            <p className="mt-5 text-sm font-bold">Connectez-vous pour voir vos notifications</p>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#667085]">Commandes, messages et nouveautés de vos vendeurs suivis apparaîtront ici.</p>
            <button type="button" onClick={() => setShowAuth(true)} className="mt-5 rounded-full bg-[#FF6B00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2">
              Se connecter
            </button>
          </div>
        ) : (
          <>
            {/* Notifications push : toujours facultatif */}
            <section data-tour="notif-push" className="rounded-2xl border border-[#EAECF0] bg-[#FFF8F3] p-4">
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
                        className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 disabled:opacity-60 ${push === 'on' ? 'border border-[#D0D5DD] bg-white text-[#344054]' : 'bg-[#FF6B00] text-white hover:bg-[#E85F00]'}`}
                      >
                        {pushBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {push === 'on' ? 'Désactiver' : 'Activer'}
                      </button>
                      {push === 'on' && (
                        <button type="button" onClick={sendTest} className="rounded-full border border-[#D0D5DD] bg-white px-4 py-2 text-xs font-semibold text-[#344054] hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
                          Envoyer un test
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div role="tablist" aria-label="Filtrer les notifications" data-tour="notif-filters" className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${filter === tab.key ? 'bg-[#111111] text-white' : 'bg-[#F2F4F7] text-[#344054] hover:bg-[#EAECF0]'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loading ? (
              <ul className="space-y-2" aria-busy="true" aria-label="Chargement">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="flex animate-pulse gap-3 rounded-2xl border border-[#EAECF0] p-4">
                    <span className="h-10 w-10 rounded-full bg-[#F2F4F7]" />
                    <span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-[#F2F4F7]" /><span className="block h-3 w-4/5 rounded bg-[#F2F4F7]" /></span>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div role="alert" className="rounded-2xl border border-[#FDA29B] bg-[#FEF3F2] px-5 py-8 text-center">
                <p className="text-sm font-bold text-[#B42318]">{error}</p>
                <button type="button" onClick={() => load(filter)} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white hover:bg-[#333]">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
                </button>
              </div>
            ) : items.length === 0 ? (
              <div data-tour="notif-empty" className="rounded-2xl border border-dashed border-[#D0D5DD] bg-white px-6 py-14 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]"><Bell className="h-7 w-7" aria-hidden="true" /></span>
                <p className="mt-5 text-sm font-bold">{filter === 'unread' ? 'Tout est lu, bravo !' : 'Aucune notification pour le moment'}</p>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-[#667085]">
                  {filter === 'unread' ? 'Vous n’avez aucune notification non lue.' : 'Vos messages, commandes et paiements apparaîtront ici dès qu’il y aura du nouveau.'}
                </p>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {items.map((item, index) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        data-tour={index === 0 ? 'notif-item' : undefined}
                        aria-label={`${item.isRead ? '' : 'Non lue. '}${item.title}. ${item.message}`}
                        className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${item.isRead ? 'border-[#EAECF0] bg-white hover:bg-[#FCFCFD]' : 'border-[#FFD7B5] bg-[#FFF8F3] hover:bg-[#FFF1E7]'}`}
                      >
                        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${item.isRead ? 'bg-[#F2F4F7] text-[#667085]' : 'bg-[#FFF1E7] text-[#FF6B00]'}`}>
                          <TypeIcon type={item.type} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={`text-sm ${item.isRead ? 'font-semibold' : 'font-bold'}`}>{item.title}</span>
                            <time dateTime={item.createdAt} className="flex-shrink-0 text-[11px] text-[#667085]">{timeAgo(item.createdAt)}</time>
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-[#667085]">{item.message}</span>
                        </span>
                        {!item.isRead && <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-[#FF6B00]" />}
                      </button>
                    </li>
                  ))}
                </ul>
                {nextCursor && (
                  <button type="button" onClick={loadMore} disabled={loadingMore} className="mx-auto flex items-center gap-2 rounded-full border border-[#D0D5DD] px-5 py-2.5 text-xs font-semibold text-[#344054] hover:border-[#FF6B00] hover:text-[#FF6B00] disabled:opacity-60">
                    {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Voir plus
                  </button>
                )}
              </>
            )}
          </>
        )}
      </main>

      {notice && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-20 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
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
