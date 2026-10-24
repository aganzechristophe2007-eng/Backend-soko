import React, { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Bell, Camera, ChevronRight, CreditCard, Lock, MapPin, Monitor, Package, Palmtree,
  ShieldAlert, ShieldCheck, User as UserIcon, Loader2, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/Authcontext';
import { apiFetch } from '../api/client';
import { getMediaUrl } from '../lib/media';
import { usePreferences } from '../lib/settingsApi';
import {
  AccountSection, DangerSection, DisplaySection, EvolutionSection, ListingsSection, PaymentsSection, SecuritySection,
} from '../components/settings/AccountSections';
import { DeliverySection, NotificationsSection, PrivacySection, VacationSection } from '../components/settings/PreferencesSections';
import { Notice } from '../components/settings/ui';

/**
 * Paramètres, façon Facebook : un menu organisé par lots (Compte, Préférences, Activité et boutique,
 * Paiements, Zone sensible). Sur mobile, le menu s'ouvre puis chaque lot s'affiche sur sa propre page ;
 * sur ordinateur, le menu reste à gauche et le lot choisi s'affiche à droite.
 */

type SectionId =
  | 'compte' | 'securite' | 'confidentialite' | 'notifications' | 'affichage'
  | 'annonces' | 'evolution' | 'vacances' | 'livraison' | 'paiements' | 'zone-sensible';

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  group: string;
  needsAuth: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'compte', label: 'Informations personnelles', description: 'Nom, téléphone, rôle', icon: UserIcon, group: 'Compte', needsAuth: true },
  { id: 'securite', label: 'Sécurité', description: 'Mot de passe et session', icon: Lock, group: 'Compte', needsAuth: true },
  { id: 'confidentialite', label: 'Confidentialité', description: 'Profil, messages, utilisateurs bloqués', icon: ShieldCheck, group: 'Compte', needsAuth: true },
  { id: 'notifications', label: 'Notifications', description: 'Alertes par type, push', icon: Bell, group: 'Préférences', needsAuth: true },
  { id: 'affichage', label: 'Affichage', description: 'Thème, texte, arrière-plan', icon: Monitor, group: 'Préférences', needsAuth: false },
  { id: 'annonces', label: 'Mes annonces', description: 'Vendues, supprimer, vues', icon: Package, group: 'Activité et boutique', needsAuth: true },
  { id: 'evolution', label: 'Mon évolution', description: 'Vues, ventes, revenus, achats', icon: BarChart3, group: 'Activité et boutique', needsAuth: true },
  { id: 'vacances', label: 'Mode vacances', description: 'Suspendre les commandes', icon: Palmtree, group: 'Activité et boutique', needsAuth: true },
  { id: 'livraison', label: 'Adresse de livraison', description: 'Pré-remplit vos commandes', icon: MapPin, group: 'Activité et boutique', needsAuth: true },
  { id: 'paiements', label: 'Paiements', description: 'Portefeuille et frais', icon: CreditCard, group: 'Paiements', needsAuth: true },
  { id: 'zone-sensible', label: 'Pause et suppression', description: 'Mettre en pause, supprimer le compte', icon: ShieldAlert, group: 'Zone sensible', needsAuth: true },
];

const GROUP_ORDER = ['Compte', 'Préférences', 'Activité et boutique', 'Paiements', 'Zone sensible'];

export default function Settings() {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const { user, refreshUser } = useAuth() as any;
  const { prefs, account, setAccount, error, setError, save } = usePreferences(user);

  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const available = SECTIONS.filter((s) => !s.needsAuth || user);
  const requested = available.find((s) => s.id === section);
  // Sur ordinateur, un lot est toujours ouvert à droite ; sur mobile, seul le menu s'affiche tant qu'aucun lot n'est choisi.
  const current = requested ?? available[0];
  const mobileShowsDetail = Boolean(requested);

  const changeAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setAvatarBusy(true);
    setAvatarError('');
    try {
      const form = new FormData();
      form.append('avatar', file);
      await apiFetch('/settings/avatar', { method: 'PATCH', body: form });
      if (typeof refreshUser === 'function') await refreshUser();
    } catch (err: any) {
      setAvatarError(err?.message || 'Impossible de changer la photo de profil.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const goBack = () => (mobileShowsDetail ? navigate('/settings') : navigate(-1));

  const renderSection = () => {
    switch (current.id) {
      case 'compte': return <AccountSection />;
      case 'securite': return <SecuritySection />;
      case 'confidentialite': return <PrivacySection prefs={prefs} save={save} />;
      case 'notifications': return <NotificationsSection prefs={prefs} save={save} />;
      case 'affichage': return <DisplaySection />;
      case 'annonces': return <ListingsSection />;
      case 'evolution': return <EvolutionSection />;
      case 'vacances': return <VacationSection prefs={prefs} save={save} />;
      case 'livraison': return <DeliverySection prefs={prefs} save={save} />;
      case 'paiements': return <PaymentsSection />;
      case 'zone-sensible': return <DangerSection account={account} onChange={setAccount} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <header className="sticky top-0 z-30 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={goBack}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#344054] transition-colors hover:bg-[#F2F4F7] focus-visible:bg-[#EAECF0] focus-visible:outline-none ${mobileShowsDetail ? '' : 'lg:invisible'}`}
            aria-label="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">
            <span className={mobileShowsDetail ? 'hidden lg:inline' : ''}>Paramètres</span>
            {mobileShowsDetail && <span className="lg:hidden">{current.label}</span>}
          </h1>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 pb-16 pt-2 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-10">
        {/* ---------------------------- MENU PAR LOTS ---------------------------- */}
        <nav aria-label="Paramètres" className={`${mobileShowsDetail ? 'hidden lg:block' : ''}`}>
          {user ? (
            <div className="mb-6 flex items-center gap-4 rounded-2xl bg-[#F2F4F7] p-4">
              <div className="relative flex-shrink-0">
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#EAECF0]">
                  {user.avatar ? <img src={getMediaUrl(user.avatar)} alt={user.name} className="h-full w-full object-cover" /> : <UserIcon className="h-7 w-7 text-[#667085]" />}
                </span>
                <button
                  type="button"
                  onClick={() => avatarInput.current?.click()}
                  disabled={avatarBusy}
                  aria-label="Changer la photo de profil"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#FF6B00] text-white hover:bg-[#E85F00] disabled:opacity-60"
                >
                  {avatarBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={avatarInput} type="file" accept="image/*" onChange={changeAvatar} className="hidden" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold">{user.name}</p>
                <p className="truncate text-xs text-[#667085]">{user.email}</p>
                {user.id && <Link to={`/users/${user.id}`} className="mt-1 inline-block text-xs font-bold text-[#FF6B00] hover:underline">Voir mon profil public</Link>}
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl bg-[#F2F4F7] p-5">
              <p className="text-base font-bold">Connectez-vous pour accéder à votre compte</p>
              <p className="mt-1 text-sm text-[#667085]">Votre profil, vos annonces et votre portefeuille apparaîtront ici.</p>
              <Link to="/login?redirect=/settings" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#FF6B00] px-6 text-sm font-bold text-white hover:bg-[#E85F00]">Connexion</Link>
            </div>
          )}
          {avatarError && <div className="mb-4"><Notice tone="error">{avatarError}</Notice></div>}

          {GROUP_ORDER.map((group) => {
            const items = available.filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group} className="mb-5">
                <h2 className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wide text-[#667085]">{group}</h2>
                <ul className="space-y-0.5">
                  {items.map((s) => {
                    const Icon = s.icon;
                    const active = s.id === current.id;
                    return (
                      <li key={s.id}>
                        <Link
                          to={`/settings/${s.id}`}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors focus-visible:bg-[#EAECF0] focus-visible:outline-none ${active ? 'lg:bg-[#FFF1E7]' : 'hover:bg-[#F2F4F7]'}`}
                        >
                          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${s.id === 'zone-sensible' ? 'bg-red-50 text-red-600' : 'bg-[#FFF1E7] text-[#FF6B00]'}`}>
                            <Icon className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{s.label}</span>
                            <span className="block truncate text-xs text-[#667085]">{s.description}</span>
                          </span>
                          <ChevronRight className="h-5 w-5 flex-shrink-0 text-[#98A2B3] lg:hidden" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>

        {/* ---------------------------- CONTENU DU LOT ---------------------------- */}
        <main className={`min-w-0 ${mobileShowsDetail ? '' : 'hidden lg:block'}`}>
          {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
