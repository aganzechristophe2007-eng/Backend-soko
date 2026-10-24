import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home as HomeIcon, Store, Package, MessageSquare, Bell, Plus, User as UserIcon,
  Wallet as WalletIcon, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../context/Authcontext';
import { BASE_URL } from '../api/client';
import { useUnreadNotifications } from '../lib/notificationsStore';
import { useNewShopsCount } from '../lib/newShops';
import { applyThemeMode, readThemeMode, resolveDark, setThemeMode, THEME_MODE_EVENT } from '../lib/themeMode';
import NotificationBadge from './NotificationBadge';
import AccountStatusBanner from './AccountStatusBanner';

/**
 * Coque de navigation globale, inspirée d'Instagram :
 *  - ordinateur : barre latérale à gauche (icônes seules en largeur moyenne, icônes + libellés en grand écran) ;
 *  - mobile : barre du bas fine et plate (Accueil, Commandes, Poster au centre, Messages, Profil).
 * Elle n'ajoute aucune route : elle ne fait que relier celles qui existent déjà dans App.tsx.
 */

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const mediaUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_ORIGIN}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
};

// Pages plein écran : aucune navigation globale.
const HIDE_ALL = ['/login', '/register', '/a30-ia'];
// Pages qui ont leur propre barre d'action en bas : pas de barre du bas globale sur mobile.
const HIDE_BOTTOM_PREFIX = ['/messages', '/create-product', '/pay/', '/products/'];

interface Item {
  key: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  match: (path: string) => boolean;
  protectedRoute?: boolean;
  badge?: number;
  badgeTone?: 'alert' | 'new';
  badgeLabel?: string;
  mobile?: boolean;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const unread = useUnreadNotifications(signedIn);
  const newShops = useNewShopsCount();

  const [dark, setDark] = useState<boolean>(() => resolveDark(readThemeMode()));

  // Applique le mode d'apparence au démarrage et reste synchronisé (réglages, autre onglet, thème du système).
  useEffect(() => {
    applyThemeMode(readThemeMode());
    const sync = () => {
      const mode = readThemeMode();
      applyThemeMode(mode);
      setDark(resolveDark(mode));
    };
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    window.addEventListener(THEME_MODE_EVENT, sync);
    window.addEventListener('storage', sync);
    media?.addEventListener?.('change', sync);
    return () => {
      window.removeEventListener(THEME_MODE_EVENT, sync);
      window.removeEventListener('storage', sync);
      media?.removeEventListener?.('change', sync);
    };
  }, []);

  const hideAll = HIDE_ALL.includes(pathname);
  if (hideAll) return <>{children}</>;
  const hideBottom = HIDE_BOTTOM_PREFIX.some((p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p));

  const go = (to: string, needsAuth?: boolean) => (e: React.MouseEvent) => {
    if (needsAuth && !signedIn) {
      e.preventDefault();
      navigate(`/login?redirect=${encodeURIComponent(to)}`);
    }
  };

  const items: Item[] = [
    { key: 'home', label: 'Accueil', to: '/', icon: HomeIcon, match: (p) => p === '/' || p === '/accueil' || p.startsWith('/products'), mobile: true },
    { key: 'shops', label: 'Boutiques', to: '/boutique', icon: Store, match: (p) => p.startsWith('/boutique') || p.startsWith('/shops'), badge: newShops, badgeTone: 'new', badgeLabel: newShops > 1 ? 'nouvelles boutiques' : 'nouvelle boutique' },
    { key: 'orders', label: 'Commandes', to: '/orders', icon: Package, match: (p) => p.startsWith('/orders') || p.startsWith('/pay'), protectedRoute: true, mobile: true },
    { key: 'messages', label: 'Messages', to: '/messages', icon: MessageSquare, match: (p) => p.startsWith('/messages'), protectedRoute: true, mobile: true },
    { key: 'notifications', label: 'Notifications', to: '/notifications', icon: Bell, match: (p) => p.startsWith('/notifications'), protectedRoute: true, badge: unread, badgeTone: 'alert', badgeLabel: 'non lues' },
    { key: 'wallet', label: 'Portefeuille', to: '/wallet', icon: WalletIcon, match: (p) => p.startsWith('/wallet'), protectedRoute: true },
  ];
  const profileActive = pathname.startsWith('/settings') || pathname.startsWith('/users');
  const profileTo = '/settings';

  const avatar = (size: string) => (
    <span className={`${size} flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F2F4F7] text-[#111111]`}>
      {signedIn && user?.avatar ? (
        <img src={mediaUrl(user.avatar)} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserIcon className="h-4 w-4" aria-hidden />
      )}
    </span>
  );

  const sidebarLink = (item: Item) => {
    const active = item.match(pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.key}
        to={item.to}
        onClick={go(item.to, item.protectedRoute)}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        className={`group relative flex h-12 items-center justify-center gap-4 rounded-xl px-3 transition-colors xl:justify-start ${active ? 'font-bold text-[#111111]' : 'font-medium text-[#344054]'} hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]`}
      >
        <span className="relative flex h-6 w-6 flex-shrink-0 items-center justify-center transition-transform group-hover:scale-105">
          <Icon className="h-6 w-6" strokeWidth={active ? 2.6 : 1.9} aria-hidden />
          {item.badge ? <NotificationBadge count={item.badge} tone={item.badgeTone} srLabel={item.badgeLabel} /> : null}
        </span>
        <span className="hidden text-[15px] xl:inline">{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* BARRE LATÉRALE (ordinateur) */}
      <aside
        aria-label="Navigation principale"
        className="fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col border-r border-[#EAECF0] bg-white px-3 pb-4 pt-5 lg:flex xl:w-[244px]"
      >
        <Link to="/" aria-label="CBF SOKO, accueil" className="mb-6 flex h-12 items-center justify-center rounded-xl px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] xl:justify-start">
          <img src="/logo-cbf-soko.png" alt="CBF SOKO" className="hidden h-10 w-auto xl:block" />
          <span className="flex flex-col items-center text-[11px] font-black leading-[1.05] tracking-tight xl:hidden" aria-hidden>
            <span className="text-[#10B981]">CBF</span>
            <span className="text-[#FF6B00]">SOKO</span>
          </span>
        </Link>

        <nav className="flex flex-col gap-1">
          {items.map(sidebarLink)}
          <Link
            to="/create-product"
            onClick={go('/create-product', true)}
            title="Publier une annonce"
            className="mt-3 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-3 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
          >
            <Plus className="h-6 w-6" strokeWidth={2.6} aria-hidden />
            <span className="hidden xl:inline">Publier</span>
          </Link>
        </nav>

        <div className="mt-auto flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setThemeMode(dark ? 'light' : 'dark')}
            aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={dark ? 'Mode clair' : 'Mode sombre'}
            className="flex h-12 items-center justify-center gap-4 rounded-xl px-3 font-medium text-[#344054] transition-colors hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] xl:justify-start"
          >
            {dark ? <Sun className="h-6 w-6" strokeWidth={1.9} aria-hidden /> : <Moon className="h-6 w-6" strokeWidth={1.9} aria-hidden />}
            <span className="hidden text-[15px] xl:inline">{dark ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
          <Link
            to={signedIn ? profileTo : '/login'}
            aria-current={profileActive ? 'page' : undefined}
            title={signedIn ? 'Profil et paramètres' : 'Connexion'}
            className={`flex h-12 items-center justify-center gap-4 rounded-xl px-3 transition-colors hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] xl:justify-start ${profileActive ? 'font-bold text-[#111111]' : 'font-medium text-[#344054]'}`}
          >
            {avatar('h-7 w-7')}
            <span className="hidden min-w-0 truncate text-[15px] xl:inline">{signedIn ? (user?.name || 'Mon profil') : 'Connexion'}</span>
          </Link>
        </div>
      </aside>

      {/* CONTENU */}
      <div className={`app-content has-sidebar ${hideBottom ? '' : 'has-bottom-nav'}`}><AccountStatusBanner />{children}</div>

      {/* BARRE DU BAS (mobile) */}
      {!hideBottom && (
        <nav
          aria-label="Navigation mobile"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EAECF0] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <ul className="mx-auto grid h-[60px] max-w-xl grid-cols-5 items-center">
            {items.filter((i) => i.mobile).slice(0, 1).map((item) => <MobileTab key={item.key} item={item} active={item.match(pathname)} onClick={go(item.to, item.protectedRoute)} />)}
            {items.filter((i) => i.key === 'orders').map((item) => <MobileTab key={item.key} item={item} active={item.match(pathname)} onClick={go(item.to, item.protectedRoute)} />)}
            <li className="flex justify-center">
              <Link
                to="/create-product"
                onClick={go('/create-product', true)}
                aria-label="Publier une annonce"
                className="flex h-10 w-12 items-center justify-center rounded-xl bg-[#FF6B00] text-white transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
              >
                <Plus className="h-6 w-6" strokeWidth={2.8} aria-hidden />
              </Link>
            </li>
            {items.filter((i) => i.key === 'messages').map((item) => <MobileTab key={item.key} item={item} active={item.match(pathname)} onClick={go(item.to, item.protectedRoute)} />)}
            <li>
              <Link
                to={signedIn ? profileTo : '/login'}
                aria-current={profileActive ? 'page' : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] ${profileActive ? 'font-bold text-[#111111]' : 'font-medium text-[#667085]'}`}
              >
                <span className={`rounded-full ${profileActive ? 'ring-2 ring-[#111111] ring-offset-1' : ''}`}>{avatar('h-6 w-6')}</span>
                <span>Profil</span>
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </>
  );
}

function MobileTab({ item, active, onClick }: { item: Item; active: boolean; onClick: (e: React.MouseEvent) => void }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] ${active ? 'font-bold text-[#111111]' : 'font-medium text-[#667085]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF6B00]`}
      >
        <span className="relative">
          <Icon className="h-6 w-6" strokeWidth={active ? 2.6 : 1.9} aria-hidden />
          {item.badge ? <NotificationBadge count={item.badge} tone={item.badgeTone} srLabel={item.badgeLabel} /> : null}
        </span>
        <span>{item.label}</span>
      </Link>
    </li>
  );
}
