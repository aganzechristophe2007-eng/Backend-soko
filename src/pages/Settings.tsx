import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Camera, Check, FolderOpen, User as UserIcon, Eye, Package,
  Trash2, CheckCircle2, Wallet, BarChart3, Loader2, X, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/Authcontext';
import { apiFetch, BASE_URL } from '../api/client';
import { setThemeMode, readThemeMode, THEME_MODE_OPTIONS, THEME_MODE_EVENT, type ThemeMode } from '../lib/themeMode';
import { RoleCard, ProfileEditor, PasswordChanger, EvolutionDashboard, LogoutButton } from '../components/settingsExtras';
const TEXT_SIZE_OPTIONS = [
  { id: 'small', label: 'Petit', px: 14 },
  { id: 'medium', label: 'Normal', px: 16 },
  { id: 'large', label: 'Grand', px: 18 },
];
const FONT_FAMILY_OPTIONS = [
  { id: 'system', label: 'Par défaut', value: 'inherit' },
  { id: 'sans', label: 'Sans-serif', value: 'Arial, sans-serif' },
  { id: 'serif', label: 'Serif', value: 'Georgia, serif' },
];
const TEXT_SIZE_STORAGE_KEY = 'cbfsoko-text-size';
const TEXT_FAMILY_STORAGE_KEY = 'cbfsoko-text-family';
const readSavedTextSize = () => {
  const saved = Number(localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
  return TEXT_SIZE_OPTIONS.some((option) => option.px === saved) ? saved : 16;
};
const readSavedTextFamily = () => {
  const saved = localStorage.getItem(TEXT_FAMILY_STORAGE_KEY);
  return FONT_FAMILY_OPTIONS.some((option) => option.value === saved) ? saved! : 'inherit';
};
const saveTextPrefs = (size: number, family: string) => {
  localStorage.setItem(TEXT_SIZE_STORAGE_KEY, String(size));
  localStorage.setItem(TEXT_FAMILY_STORAGE_KEY, family);
};

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

const getMediaUrl = (mediaPath?: string | null) => {
  if (!mediaPath) return null;
  if (mediaPath.startsWith('http') || mediaPath.startsWith('blob:') || mediaPath.startsWith('data:')) {
    return mediaPath;
  }
  const cleanPath = mediaPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${API_ORIGIN}/${cleanPath}`;
};

const formatNumber = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

/* ------------------------------------------------------------------ */
/*  Thèmes d'arrière-plan — dans l'esprit e-commerce / marché         */
/*  (seule source de vérité : utilisée ici ET lue par Home.tsx via     */
/*  la clé localStorage "cbfsoko-custom-bg")                          */
/* ------------------------------------------------------------------ */
const PRESET_BACKGROUNDS = [
  { id: '0', name: 'Blanc classique', value: '#FFFFFF' },
  { id: '1', name: 'Marché Vivant', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&w=1200&q=80")' },
  { id: '2', name: 'Boutique Textile', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80")' },
  { id: '3', name: 'Colis & Livraison', value: 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.88)), url("https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80")' },
  { id: '4', name: 'Étal de Fruits', value: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80")' },
  { id: '5', name: 'Électronique', value: 'linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.9)), url("https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80")' },
  { id: '6', name: 'Mode & Style', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=80")' },
  { id: '7', name: 'Sacs & Accessoires', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1524498372554-4e1c1c2c1611?auto=format&fit=crop&w=1200&q=80")' },
  { id: '8', name: 'Caisse & Paiement', value: 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.88)), url("https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1200&q=80")' },
  { id: '9', name: 'Minimaliste Noir', value: '#080808' },
  { id: '10', name: 'Ambre CBFSOKO', value: 'linear-gradient(135deg, #451a03 0%, #09090b 100%)' },
  { id: '11', name: 'Émeraude', value: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)' },
  { id: '12', name: 'Gris Métallique', value: 'linear-gradient(135deg, #1c1c1e 0%, #0a0a0c 100%)' },
];

type MyProduct = {
  id: string;
  title: string;
  priceUSD: number;
  images?: string[];
  views?: number;
  status?: 'AVAILABLE' | 'SOLD' | string;
};

const SettingsSection = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
  <section className="mb-8">
    <h2 className="text-base font-bold text-[#111111]">{title}</h2>
    {description && <p className="mt-0.5 text-sm text-[#667085]">{description}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

export default function Settings() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth() as any; // refreshUser : optionnel selon votre AuthContext

  const [customBg, setCustomBg] = useState<string>(() => {
    const saved = localStorage.getItem('cbfsoko-custom-bg');
    if (!saved || saved.toLowerCase() === '#080808' || saved.toLowerCase() === '#000000') return '#FFFFFF';
    return saved;
  });

  const [textSize, setTextSize] = useState<number>(() => readSavedTextSize());
  const [textFamily, setTextFamily] = useState<string>(() => readSavedTextFamily());

  const handleSelectTextSize = (px: number) => {
    setTextSize(px);
    saveTextPrefs(px, textFamily);
  };
  const handleSelectTextFamily = (family: string) => {
    setTextFamily(family);
    saveTextPrefs(textSize, family);
  };

  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const bgCameraInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [myProducts, setMyProducts] = useState<MyProduct[] | null>(null);
  const [productsError, setProductsError] = useState('');
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ----- Arrière-plan -----
  const handleSelectBg = (bgValue: string) => {
    setCustomBg(bgValue);
    localStorage.setItem('cbfsoko-custom-bg', bgValue);
    window.dispatchEvent(new Event('storage-bg-change'));
  };

  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        handleSelectBg(`linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.85)), url("${result}")`);
      }
    };
    reader.readAsDataURL(file);
  };

  // ----- Photo de profil -----
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;

    setAvatarUploading(true);
    setAvatarError('');
    try {
      const form = new FormData();
      form.append('avatar', file);
      // apiFetch : passer un FormData sans forcer Content-Type JSON.
      await apiFetch('/settings/avatar', { method: 'PATCH', body: form });
      if (typeof refreshUser === 'function') await refreshUser();
      else window.location.reload();
    } catch (err: any) {
      setAvatarError(err?.message || "Impossible de changer la photo de profil.");
    } finally {
      setAvatarUploading(false);
    }
  };

  // ----- Mes annonces -----
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    apiFetch('/settings/products')
      .then((res: any) => {
        if (cancelled) return;
        const list = res?.data ?? res?.products ?? res ?? [];
        setMyProducts(Array.isArray(list) ? list : []);
      })
      .catch((err: any) => {
        if (!cancelled) setProductsError(err?.message || 'Impossible de charger vos annonces.');
      });

    return () => { cancelled = true; };
  }, [user]);

  const totalViews = useMemo(
    () => (myProducts ?? []).reduce((sum, p) => sum + (p.views ?? 0), 0),
    [myProducts],
  );
  const activeCount = useMemo(
    () => (myProducts ?? []).filter((p) => p.status !== 'SOLD').length,
    [myProducts],
  );
  const soldCount = (myProducts?.length ?? 0) - activeCount;

  // Répartition des vues par annonce, pour le petit graphique en barres.
  const viewsChart = useMemo(() => {
    const items = [...(myProducts ?? [])].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6);
    const max = Math.max(1, ...items.map((p) => p.views ?? 0));
    return { items, max };
  }, [myProducts]);

  const markAsSold = async (id: string) => {
    setBusyProductId(id);
    try {
      await apiFetch(`/settings/products/${id}/sold`, { method: 'PATCH' });
      setMyProducts((prev) => prev?.map((p) => (p.id === id ? { ...p, status: 'SOLD' } : p)) ?? prev);
    } catch (err: any) {
      setProductsError(err?.message || "Impossible de marquer l'annonce comme vendue.");
    } finally {
      setBusyProductId(null);
    }
  };

  const deleteProduct = async (id: string) => {
    setBusyProductId(id);
    try {
      await apiFetch(`/settings/products/${id}`, { method: 'DELETE' });
      setMyProducts((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    } catch (err: any) {
      setProductsError(err?.message || "Impossible de supprimer l'annonce.");
    } finally {
      setBusyProductId(null);
      setConfirmDeleteId(null);
    }
  };

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readThemeMode());
  useEffect(() => {
    const sync = () => setThemeModeState(readThemeMode());
    window.addEventListener(THEME_MODE_EVENT, sync);
    return () => window.removeEventListener(THEME_MODE_EVENT, sync);
  }, []);
  const handleThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    setThemeMode(mode);
  };

  const segment = (active: boolean) =>
    `flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${
      active ? 'bg-[#FF6B00] text-white' : 'text-[#344054] hover:bg-[#EAECF0]'
    }`;
  const cardCls = 'rounded-2xl border border-[#EAECF0] bg-white';

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <header className="sticky top-0 z-30 border-b border-[#EAECF0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#344054] transition-colors hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
            aria-label="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold">Profil et paramètres</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
        {/* EN-TÊTE DE PROFIL */}
        {user ? (
          <section className="mb-8" aria-label="Mon compte">
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#F2F4F7] sm:h-24 sm:w-24">
                  {user.avatar ? (
                    <img src={getMediaUrl(user.avatar) ?? undefined} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    <UserIcon className="h-9 w-9 text-[#667085]" />
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  aria-label="Changer la photo de profil"
                  className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#FF6B00] text-white ring-2 ring-white hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-[#111111] disabled:opacity-60"
                >
                  {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold">{user.name}</p>
                <p className="truncate text-sm text-[#667085]">{user.email}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center sm:max-w-sm">
                  <div>
                    <p className="text-lg font-bold">{formatNumber(totalViews)}</p>
                    <p className="text-xs text-[#667085]">Vues</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{activeCount}</p>
                    <p className="text-xs text-[#667085]">En vente</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{Math.max(0, soldCount)}</p>
                    <p className="text-xs text-[#667085]">Vendues</p>
                  </div>
                </div>
              </div>
            </div>
            {avatarError && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-red-600">
                <AlertTriangle className="h-4 w-4" /> {avatarError}
              </p>
            )}
            {user.id && (
              <Link
                to={`/users/${user.id}`}
                className="mt-4 flex h-10 w-full items-center justify-center rounded-xl bg-[#F2F4F7] text-sm font-semibold text-[#111111] transition-colors hover:bg-[#EAECF0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
              >
                Voir mon profil public
              </Link>
            )}
          </section>
        ) : (
          <section className={`mb-8 p-5 ${cardCls}`}>
            <p className="text-base font-bold">Connectez-vous pour accéder à votre compte</p>
            <p className="mt-1 text-sm text-[#667085]">Votre profil, vos annonces et votre portefeuille apparaîtront ici.</p>
            <Link
              to="/login?redirect=/settings"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#FF6B00] px-6 text-sm font-bold text-white hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
            >
              Connexion
            </Link>
          </section>
        )}

        {user && (
          <>
            {/* PORTEFEUILLE */}
            <SettingsSection title="Paiements">
              <Link
                to="/wallet"
                className={`flex items-center gap-3 p-4 transition-colors hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${cardCls}`}
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
                  <Wallet className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">Mon portefeuille</p>
                  <p className="text-xs text-[#667085]">Solde, paiements reçus et retraits</p>
                </div>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-[#98A2B3]" aria-hidden="true" />
              </Link>
            </SettingsSection>

            {/* MES ANNONCES */}
            <SettingsSection title="Mes annonces" description="Marquez-les vendues ou supprimez-les.">
              {productsError && (
                <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-red-600">
                  <AlertTriangle className="h-4 w-4" /> {productsError}
                </p>
              )}

              {myProducts === null ? (
                <div className={`flex items-center gap-2 p-4 text-sm text-[#667085] ${cardCls}`}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement de vos annonces...
                </div>
              ) : myProducts.length === 0 ? (
                <div className={`flex flex-col items-center gap-2 p-6 text-center ${cardCls}`}>
                  <Package className="h-8 w-8 text-[#98A2B3]" aria-hidden="true" />
                  <p className="text-sm text-[#667085]">Vous n'avez publié aucune annonce pour le moment.</p>
                  <Link to="/create-product" className="mt-1 text-sm font-bold text-[#FF6B00] hover:underline">Publier une annonce</Link>
                </div>
              ) : (
                <ul className={`divide-y divide-[#EAECF0] overflow-hidden ${cardCls}`}>
                  {myProducts.map((p) => {
                    const isSold = p.status === 'SOLD';
                    const isBusy = busyProductId === p.id;
                    return (
                      <li key={p.id} className="flex items-center gap-3 p-3">
                        <span className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#F2F4F7]">
                          {p.images?.[0] ? (
                            <img src={getMediaUrl(p.images[0]) ?? undefined} alt={p.title} className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[#667085]">
                              <Package className="h-5 w-5" />
                            </span>
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{p.title}</p>
                          <p className="text-sm font-bold text-[#FF6B00]">{p.priceUSD} $</p>
                          <p className="mt-0.5 flex items-center gap-2 text-xs text-[#667085]">
                            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {p.views ?? 0}</span>
                            {isSold && <span className="rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-600">Vendue</span>}
                          </p>
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          {!isSold && (
                            <button
                              type="button"
                              onClick={() => markAsSold(p.id)}
                              disabled={isBusy}
                              aria-label="Déclarer vendue"
                              title="Déclarer vendue"
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F4F7] text-green-600 hover:bg-[#EAECF0] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                            >
                              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(p.id)}
                            disabled={isBusy}
                            aria-label="Supprimer l'annonce"
                            title="Supprimer"
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F4F7] text-red-600 hover:bg-[#EAECF0] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SettingsSection>

            {/* GRAPHIQUE DES INTERACTIONS */}
            {viewsChart.items.length > 0 && (
              <SettingsSection title="Interactions" description="Vues par annonce.">
                <div className={`p-4 ${cardCls}`}>
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-[#344054]">
                    <BarChart3 className="h-4 w-4 text-[#FF6B00]" /> Les 6 annonces les plus vues
                  </p>
                  <div className="space-y-3">
                    {viewsChart.items.map((p) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="w-24 flex-shrink-0 truncate text-xs text-[#667085] sm:w-36">{p.title}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#F2F4F7]">
                          <div
                            className="h-full rounded-full bg-[#FF6B00]"
                            style={{ width: `${Math.max(4, ((p.views ?? 0) / viewsChart.max) * 100)}%` }}
                          />
                        </div>
                        <span className="w-9 flex-shrink-0 text-right text-xs font-bold">{p.views ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SettingsSection>
            )}

            <SettingsSection title="Mon évolution" description="Vos vues, ventes, revenus et achats au fil du temps.">
              <EvolutionDashboard />
            </SettingsSection>

            <SettingsSection title="Mon rôle">
              <RoleCard />
            </SettingsSection>

            <SettingsSection title="Profil" description="Modifiez votre nom et votre numéro de téléphone.">
              <ProfileEditor />
            </SettingsSection>

            <SettingsSection title="Sécurité" description="Choisissez un mot de passe que vous n'utilisez nulle part ailleurs.">
              <PasswordChanger />
            </SettingsSection>
          </>
        )}

        {/* APPARENCE : mode clair / sombre */}
        <SettingsSection title="Apparence" description="Choisissez le mode d'affichage de l'application.">
          <div role="radiogroup" aria-label="Mode d'affichage" className="flex gap-1 rounded-xl bg-[#F2F4F7] p-1">
            {THEME_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={themeMode === opt.id}
                onClick={() => handleThemeMode(opt.id)}
                className={segment(themeMode === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </SettingsSection>

        {/* TEXTE : taille et police d'écriture, appliquées à toute l'application */}
        <SettingsSection title="Texte" description="Ajustez la taille et la police d'écriture si l'affichage vous semble trop grand ou trop petit.">
          <p className="mb-2 text-xs font-semibold text-[#667085]">Taille du texte</p>
          <div role="radiogroup" aria-label="Taille du texte" className="mb-4 flex gap-1 rounded-xl bg-[#F2F4F7] p-1">
            {TEXT_SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={textSize === opt.px}
                onClick={() => handleSelectTextSize(opt.px)}
                className={segment(textSize === opt.px)}
                style={{ fontSize: `${Math.min(opt.px, 16)}px` }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="mb-2 text-xs font-semibold text-[#667085]">Police d'écriture</p>
          <div role="radiogroup" aria-label="Police d'écriture" className="flex gap-1 rounded-xl bg-[#F2F4F7] p-1">
            {FONT_FAMILY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={textFamily === opt.value}
                onClick={() => handleSelectTextFamily(opt.value)}
                className={segment(textFamily === opt.value)}
                style={{ fontFamily: opt.value }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </SettingsSection>

        {/* ARRIÈRE-PLAN DE L'ACCUEIL */}
        <SettingsSection title="Arrière-plan de l'accueil" description="Choisissez l'arrière-plan de votre marché CBFSOKO (mode clair).">
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <input type="file" accept="image/*" capture="environment" ref={bgCameraInputRef} onChange={handleBgFileChange} className="hidden" />
            <input type="file" accept="image/*" ref={bgFileInputRef} onChange={handleBgFileChange} className="hidden" />

            <button
              type="button"
              onClick={() => bgCameraInputRef.current?.click()}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FFF1E7] text-sm font-semibold text-[#FF6B00] transition-colors hover:bg-[#FFE4D1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
            >
              <Camera className="h-4 w-4" /> Caméra
            </button>
            <button
              type="button"
              onClick={() => bgFileInputRef.current?.click()}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#F2F4F7] text-sm font-semibold text-[#111111] transition-colors hover:bg-[#EAECF0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
            >
              <FolderOpen className="h-4 w-4" /> Explorateur
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PRESET_BACKGROUNDS.map((preset) => {
              const isSelected = customBg === preset.value;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectBg(preset.value)}
                  aria-pressed={isSelected}
                  aria-label={preset.name}
                  className={`relative flex h-20 flex-col items-center justify-end overflow-hidden rounded-xl border border-[#EAECF0] p-1.5 text-center text-[10px] font-semibold text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${
                    isSelected ? 'ring-2 ring-[#FF6B00]' : 'hover:ring-2 hover:ring-[#FF6B00]/40'
                  }`}
                  style={{ background: preset.value, backgroundSize: 'cover' }}
                >
                  <span className="relative z-10 w-full truncate rounded bg-black/70 px-1 py-0.5">{preset.name}</span>
                  {isSelected && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-[#FF6B00] p-0.5 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </SettingsSection>

        {/* DÉCONNEXION */}
        {user && (
          <SettingsSection title="Session">
            <LogoutButton />
          </SettingsSection>
        )}
      </main>

      {/* CONFIRMATION DE SUPPRESSION */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setConfirmDeleteId(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Supprimer cette annonce"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#EAECF0] bg-white p-5">
            <div className="flex items-start justify-between">
              <p className="text-base font-bold text-[#111111]">Supprimer cette annonce ?</p>
              <button type="button" onClick={() => setConfirmDeleteId(null)} aria-label="Fermer" className="flex h-8 w-8 items-center justify-center rounded-full text-[#667085] hover:bg-[#F2F4F7] hover:text-[#111111]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[#667085]">Cette action est définitive et ne peut pas être annulée.</p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="h-11 flex-1 rounded-xl bg-[#F2F4F7] text-sm font-bold text-[#111111] hover:bg-[#EAECF0]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => deleteProduct(confirmDeleteId)}
                disabled={busyProductId === confirmDeleteId}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busyProductId === confirmDeleteId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}