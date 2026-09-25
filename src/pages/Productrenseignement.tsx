import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, MessageSquare, Store } from 'lucide-react';
import { apiFetch, BASE_URL } from '../api/client';
import AuthSheet from './Authsheet';
import { useAuth } from '../context/Authcontext';

/* ------------------------------------------------------------------ */
/*  Origine des fichiers statiques (images/vidéos servies par Express) */
/* ------------------------------------------------------------------ */
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80';

const getMediaUrl = (mediaPath?: string | null) => {
  if (!mediaPath) return FALLBACK_IMAGE;
  if (mediaPath.startsWith('http') || mediaPath.startsWith('blob:') || mediaPath.startsWith('data:')) return mediaPath;
  const cleanPath = mediaPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${API_ORIGIN}/${cleanPath}`;
};

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface User {
  id?: string;
  name: string;
  balance: number;
  role?: string;
  avatar?: string;
}

interface ProductItem {
  id: string;
  title: string;
  description?: string;
  priceUSD: number;
  priceCDF: number;
  category?: { id: string; name: string };
  images: string[];
  seller?: { id: string; name: string; avatar?: string };
  location?: string;
  state?: string;
  quantity?: number;
  type?: string;
  createdAt?: string;
}

interface InfoRow {
  label: string;
  value: React.ReactNode;
}

type ThemeMode = 'dark' | 'light' | 'system';

const readThemeMode = (): ThemeMode => {
  const saved = localStorage.getItem('cbfsoko-theme-mode');
  return saved === 'dark' || saved === 'system' ? saved : 'light';
};

const resolveDark = (mode: ThemeMode) =>
  mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

/* ------------------------------------------------------------------ */
/*  Page ProductRenseignement                                         */
/* ------------------------------------------------------------------ */

export default function ProductRenseignement() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, login: authLogin } = useAuth();

  const [darkMode] = useState<boolean>(() => resolveDark(readThemeMode()));
  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const [showAuth, setShowAuth] = useState<boolean>(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  const t = darkMode
    ? {
        page: 'bg-neutral-950 text-white',
        header: 'bg-neutral-950',
        surface: 'bg-neutral-900',
        soft: 'bg-neutral-800',
        border: 'border-neutral-800 border',
        borderStrong: 'border-neutral-700 border-b',
        muted: 'text-neutral-400',
      }
    : {
        page: 'bg-[#FAF8F5] text-neutral-950',
        header: 'bg-white',
        surface: 'bg-white',
        soft: 'bg-neutral-100',
        border: 'border-neutral-200 border',
        borderStrong: 'border-neutral-200 border-b',
        muted: 'text-neutral-500',
      };

  const iconBtn = `flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border ${t.border} ${t.surface} ${t.muted} transition-colors hover:border-orange-500 hover:text-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500`;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiFetch(`/products/${id}`)
      .then((data) => {
        if (cancelled) return;
        const item = (data?.product ?? data?.data ?? data) as ProductItem;
        setProduct(item && item.id ? item : null);
        if (!item || !item.id) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  const openAuth = (redirect: string) => {
    setPendingRedirect(redirect);
    setShowAuth(true);
  };

  const handleAuthSuccess = (nextUser: User) => {
    authLogin(nextUser);
    setShowAuth(false);
    if (pendingRedirect) {
      navigate(pendingRedirect);
      setPendingRedirect(null);
    }
  };

  const handleProtectedAction = (destination: string) => {
    if (!user) openAuth(destination);
    else navigate(destination);
  };

  const isRequest = String(product?.type || '').toUpperCase() === 'REQUEST';
  const publishedOn = product?.createdAt ? new Date(product.createdAt).toLocaleDateString('fr-FR') : null;

  const rows: InfoRow[] = [];
  if (product) {
    if (product.category?.name) rows.push({ label: 'Catégorie', value: product.category.name });
    if (product.state) rows.push({ label: 'État', value: product.state });
    if (typeof product.quantity === 'number') rows.push({ label: 'Quantité disponible', value: product.quantity });
    if (product.location) {
      rows.push({
        label: 'Localisation',
        value: (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-orange-600" />
            {product.location}
          </span>
        ),
      });
    }
    if (publishedOn) rows.push({ label: 'Publié le', value: publishedOn });
  }

  return (
    <div className={`min-h-screen ${t.page}`}>
      <header className={`sticky top-0 z-40 ${t.borderStrong} ${t.header}`}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={goBack} className={iconBtn} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">Renseignements sur le produit</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-16">
        {loading ? (
          <div className="space-y-4">
            <div className={`h-28 animate-pulse rounded-2xl ${t.soft}`} />
            <div className={`h-48 animate-pulse rounded-2xl ${t.soft}`} />
          </div>
        ) : error || !product ? (
          <div className={`rounded-2xl border border-dashed py-14 text-center ${t.border} ${t.surface}`}>
            <p className="text-sm font-semibold">Ce produit est introuvable.</p>
            <Link to="/" className="mt-5 inline-flex rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
              Retour à l'accueil
            </Link>
          </div>
        ) : (
          <>
            {/* Résumé du produit */}
            <Link to={`/products/${product.id}`} className={`flex items-center gap-3 rounded-2xl p-3 transition-colors hover:border-orange-500 ${t.border} ${t.surface}`}>
              <img src={getMediaUrl(product.images?.[0])} alt={product.title} className="h-20 w-20 flex-shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{product.title}</p>
                <p className="mt-1 text-base font-bold text-orange-600">{product.priceUSD} $</p>
                <p className={`text-xs ${t.muted}`}>Voir la page du produit</p>
              </div>
            </Link>

            {/* Caractéristiques */}
            {rows.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-bold">Caractéristiques</h2>
                <dl className={`divide-y rounded-2xl ${darkMode ? 'divide-neutral-800' : 'divide-neutral-200'} ${t.border} ${t.surface}`}>
                  {rows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 px-4 py-3 text-sm">
                      <dt className={t.muted}>{row.label}</dt>
                      <dd className="font-semibold">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* Description */}
            <section>
              <h2 className="mb-2 text-sm font-bold">Description</h2>
              {product.description ? (
                <p className={`whitespace-pre-line rounded-2xl p-4 text-sm leading-relaxed ${t.border} ${t.surface}`}>{product.description}</p>
              ) : (
                <p className={`rounded-2xl border border-dashed p-4 text-sm ${t.border} ${t.surface} ${t.muted}`}>
                  Le vendeur n'a pas ajouté de description. Contactez-le pour en savoir plus.
                </p>
              )}
            </section>

            {/* Vendeur */}
            {product.seller && (
              <section>
                <h2 className="mb-2 text-sm font-bold">Vendeur</h2>
                <div className={`flex items-center gap-3 rounded-2xl p-3 ${t.border} ${t.surface}`}>
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-500 text-white">
                    {product.seller.avatar ? (
                      <img src={getMediaUrl(product.seller.avatar)} alt={product.seller.name} className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-5 w-5" />
                    )}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{product.seller.name}</p>
                </div>
              </section>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {product.seller?.id && (
                <button
                  type="button"
                  onClick={() => handleProtectedAction(`/messages?to=${product.seller!.id}`)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-950 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  <MessageSquare className="h-4 w-4" />
                  Contacter le vendeur
                </button>
              )}
              {!isRequest && (
                <button
                  type="button"
                  onClick={() => handleProtectedAction(`/products/${product.id}?livraison=1`)}
                  className="flex-1 rounded-lg bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  Me faire livrer
                </button>
              )}
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {showAuth && <AuthSheet onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />}
      </AnimatePresence>
    </div>
  );
}