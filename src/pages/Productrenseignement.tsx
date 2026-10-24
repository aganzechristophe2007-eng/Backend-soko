import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, MapPin, MessageSquare, Store } from 'lucide-react';
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

/* ------------------------------------------------------------------ */
/*  Page ProductRenseignement                                         */
/* ------------------------------------------------------------------ */

export default function ProductRenseignement() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, login: authLogin } = useAuth();

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const [showAuth, setShowAuth] = useState<boolean>(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  const card = 'rounded-2xl border border-[#EAECF0] bg-white';
  const muted = 'text-[#667085]';
  const iconBtn = 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#344054] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]';

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
            <MapPin className="h-3.5 w-3.5 text-[#FF6B00]" />
            {product.location}
          </span>
        ),
      });
    }
    if (publishedOn) rows.push({ label: 'Publié le', value: publishedOn });
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111111]">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <button type="button" onClick={goBack} className={iconBtn} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">Renseignements sur le produit</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5 pb-28 lg:pb-12">
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-48 w-full" />
            <div className="skeleton h-24 w-full" />
          </div>
        ) : error || !product ? (
          <div className={`${card} border-dashed px-4 py-16 text-center`}>
            <p className="text-base font-bold">Ce produit est introuvable.</p>
            <p className={`mt-1 text-sm ${muted}`}>Il a peut-être été retiré par le vendeur.</p>
            <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-[#FF6B00] px-6 text-sm font-bold text-white transition-colors hover:bg-[#E85F00]">
              Retour à l'accueil
            </Link>
          </div>
        ) : (
          <>
            {/* Résumé du produit */}
            <Link to={`/products/${product.id}`} className={`${card} flex items-center gap-3 p-3 transition-colors hover:border-[#FF6B00]`}>
              <img src={getMediaUrl(product.images?.[0])} alt={product.title} className="h-20 w-20 flex-shrink-0 rounded-xl bg-[#F2F4F7] object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{product.title}</p>
                <p className="mt-1 text-lg font-extrabold text-[#FF6B00]">{product.priceUSD} $</p>
                <p className={`text-xs ${muted}`}>Voir la page du produit</p>
              </div>
              <ChevronRight className={`h-5 w-5 flex-shrink-0 ${muted}`} aria-hidden="true" />
            </Link>

            {/* Caractéristiques */}
            {rows.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-bold">Caractéristiques</h2>
                <dl className={`${card} divide-y divide-[#EAECF0]`}>
                  {rows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 px-4 py-3 text-sm">
                      <dt className={muted}>{row.label}</dt>
                      <dd className="text-right font-semibold">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* Description */}
            <section>
              <h2 className="mb-2 text-sm font-bold">Description</h2>
              {product.description ? (
                <p className={`${card} whitespace-pre-line p-4 text-sm leading-relaxed text-[#344054]`}>{product.description}</p>
              ) : (
                <p className={`${card} border-dashed p-4 text-sm ${muted}`}>
                  Le vendeur n'a pas ajouté de description. Contactez-le pour en savoir plus.
                </p>
              )}
            </section>

            {/* Vendeur */}
            {product.seller && (
              <section>
                <h2 className="mb-2 text-sm font-bold">Vendeur</h2>
                <Link
                  to={`/users/${product.seller.id}`}
                  className={`${card} flex items-center gap-3 p-3 transition-colors hover:border-[#FF6B00]`}
                >
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF6B00] text-white">
                    {product.seller.avatar ? (
                      <img src={getMediaUrl(product.seller.avatar)} alt={product.seller.name} className="h-full w-full object-cover" />
                    ) : (
                      <Store className="h-5 w-5" />
                    )}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{product.seller.name}</p>
                  <ChevronRight className={`h-5 w-5 flex-shrink-0 ${muted}`} aria-hidden="true" />
                </Link>
              </section>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row">
              {product.seller?.id && (
                <button
                  type="button"
                  onClick={() => handleProtectedAction(`/messages?to=${product.seller!.id}`)}
                  className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#D0D5DD] bg-white px-4 text-sm font-bold text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                >
                  <MessageSquare className="h-4 w-4" />
                  Contacter le vendeur
                </button>
              )}
              {!isRequest && (
                <button
                  type="button"
                  onClick={() => handleProtectedAction(`/products/${product.id}?livraison=1`)}
                  className="h-12 flex-1 rounded-full bg-[#FF6B00] px-4 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
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