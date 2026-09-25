import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Camera, Check, FolderOpen, User as UserIcon, Eye, Package,
  Trash2, CheckCircle2, Wallet, BarChart3, Loader2, X, AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/Authcontext';
import { apiFetch, BASE_URL } from '../api/client';

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
    <h2 className="text-base font-extrabold text-white sm:text-lg">{title}</h2>
    {description && <p className="mt-1 text-sm text-neutral-400">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

export default function Settings() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth() as any; // refreshUser : optionnel selon votre AuthContext

  const [customBg, setCustomBg] = useState<string>(() => {
    return localStorage.getItem('cbfsoko-custom-bg') || PRESET_BACKGROUNDS[0].value;
  });

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

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Retour"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-extrabold sm:text-xl">Paramètres</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* COMPTE */}
        <SettingsSection title="Compte">
          {user ? (
            <div className="rounded-lg bg-[#181818] p-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-orange-800">
                    {user.avatar ? (
                      <img src={getMediaUrl(user.avatar) ?? undefined} alt={user.name} className="h-full w-full object-cover" />
                    ) : (
                      <UserIcon className="h-7 w-7 text-white" />
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    aria-label="Changer la photo de profil"
                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#ea580c] text-white ring-2 ring-black hover:bg-[#c2410c] disabled:opacity-60"
                  >
                    {avatarUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  </button>
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-white">{user.name}</p>
                  <p className="truncate text-xs text-neutral-400">{user.email}</p>
                  <Link to="/profile" className="mt-1 inline-block text-xs font-bold text-[#f97316] hover:underline">
                    Voir mon profil public
                  </Link>
                </div>
              </div>
              {avatarError && (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> {avatarError}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-[#181818] p-4 text-sm text-neutral-400">
              Connectez-vous depuis l'accueil pour accéder à votre compte.
            </div>
          )}
        </SettingsSection>

        {user && (
          <>
            {/* PORTEFEUILLE */}
            <SettingsSection title="Paiements">
              <Link
                to="/wallet"
                className="flex items-center gap-3 rounded-lg bg-[#181818] p-4 transition-colors hover:bg-[#232323]"
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#ea580c]/15 text-[#f97316]">
                  <Wallet className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">Mon portefeuille</p>
                  <p className="text-xs text-neutral-400">Solde, paiements reçus et retraits</p>
                </div>
                <span className="text-neutral-500">›</span>
              </Link>
            </SettingsSection>

            {/* STATISTIQUES */}
            <SettingsSection title="Statistiques" description="Les vues et ventes de vos annonces.">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-lg bg-[#181818] p-3 text-center">
                  <Eye className="mx-auto h-4 w-4 text-[#f97316]" />
                  <p className="mt-1.5 text-lg font-extrabold text-white">{formatNumber(totalViews)}</p>
                  <p className="text-[11px] font-semibold text-neutral-400">Vues cumulées</p>
                </div>
                <div className="rounded-lg bg-[#181818] p-3 text-center">
                  <Package className="mx-auto h-4 w-4 text-[#f97316]" />
                  <p className="mt-1.5 text-lg font-extrabold text-white">{activeCount}</p>
                  <p className="text-[11px] font-semibold text-neutral-400">En vente</p>
                </div>
                <div className="rounded-lg bg-[#181818] p-3 text-center">
                  <CheckCircle2 className="mx-auto h-4 w-4 text-[#f97316]" />
                  <p className="mt-1.5 text-lg font-extrabold text-white">{Math.max(0, soldCount)}</p>
                  <p className="text-[11px] font-semibold text-neutral-400">Vendues</p>
                </div>
              </div>

              {/* Graphique des interactions (vues par annonce) */}
              {viewsChart.items.length > 0 && (
                <div className="mt-3 rounded-lg bg-[#181818] p-4">
                  <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-neutral-300">
                    <BarChart3 className="h-3.5 w-3.5 text-[#f97316]" /> Vues par annonce
                  </p>
                  <div className="space-y-2.5">
                    {viewsChart.items.map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5">
                        <span className="w-24 flex-shrink-0 truncate text-[11px] font-semibold text-neutral-400 sm:w-32">
                          {p.title}
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-[#ea580c]"
                            style={{ width: `${Math.max(4, ((p.views ?? 0) / viewsChart.max) * 100)}%` }}
                          />
                        </div>
                        <span className="w-8 flex-shrink-0 text-right text-[11px] font-bold text-white">{p.views ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SettingsSection>

            {/* MES ANNONCES */}
            <SettingsSection title="Mes annonces" description="Gérez vos publications : marquez-les vendues ou supprimez-les.">
              {productsError && (
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> {productsError}
                </p>
              )}

              {myProducts === null ? (
                <div className="flex items-center gap-2 rounded-lg bg-[#181818] p-4 text-sm text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Chargement de vos annonces...
                </div>
              ) : myProducts.length === 0 ? (
                <div className="rounded-lg bg-[#181818] p-4 text-sm text-neutral-400">
                  Vous n'avez publié aucune annonce pour le moment.
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {myProducts.map((p) => {
                    const isSold = p.status === 'SOLD';
                    const isBusy = busyProductId === p.id;
                    return (
                      <li key={p.id} className="flex items-center gap-3 rounded-lg bg-[#181818] p-3">
                        <span className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-neutral-900">
                          {p.images?.[0] ? (
                            <img src={getMediaUrl(p.images[0]) ?? undefined} alt={p.title} className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-neutral-600">
                              <Package className="h-5 w-5" />
                            </span>
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{p.title}</p>
                          <p className="text-xs font-semibold text-[#f97316]">{p.priceUSD} $</p>
                          <p className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold text-neutral-500">
                            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {p.views ?? 0}</span>
                            {isSold && <span className="rounded bg-green-900/40 px-1.5 py-0.5 text-green-400">Vendue</span>}
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
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-green-400 hover:bg-white/10 disabled:opacity-50"
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
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-red-400 hover:bg-white/10 disabled:opacity-50"
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
          </>
        )}

        {/* APPARENCE */}
        <SettingsSection title="Apparence" description="Choisissez l'arrière-plan de votre marché CBFSOKO.">
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <input type="file" accept="image/*" capture="environment" ref={bgCameraInputRef} onChange={handleBgFileChange} className="hidden" />
            <input type="file" accept="image/*" ref={bgFileInputRef} onChange={handleBgFileChange} className="hidden" />

            <button
              type="button"
              onClick={() => bgCameraInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-800/20 py-2.5 text-xs font-bold text-orange-500 transition-colors hover:bg-orange-800/30"
            >
              <Camera className="h-3.5 w-3.5" /> Caméra
            </button>
            <button
              type="button"
              onClick={() => bgFileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/20"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Explorateur
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
                  className={`relative flex h-20 flex-col items-center justify-end overflow-hidden rounded-lg p-1.5 text-center text-[9px] font-semibold text-white transition-all ${
                    isSelected ? 'ring-2 ring-[#c2410c]' : 'ring-1 ring-white/10 hover:ring-white/25'
                  }`}
                  style={{ background: preset.value, backgroundSize: 'cover' }}
                >
                  <span className="relative z-10 w-full truncate rounded bg-black/60 px-1 py-0.5">{preset.name}</span>
                  {isSelected && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-[#c2410c] p-0.5 text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </SettingsSection>
      </main>

      {/* CONFIRMATION DE SUPPRESSION */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setConfirmDeleteId(null)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#141414] p-5">
            <div className="flex items-start justify-between">
              <p className="text-base font-extrabold text-white">Supprimer cette annonce ?</p>
              <button type="button" onClick={() => setConfirmDeleteId(null)} aria-label="Fermer" className="text-neutral-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-neutral-400">Cette action est définitive et ne peut pas être annulée.</p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="h-11 flex-1 rounded-xl bg-white/10 text-sm font-bold text-white hover:bg-white/15"
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