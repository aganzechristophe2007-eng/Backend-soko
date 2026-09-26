import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Images, MapPin, Minus, Plus, Store, Info, Star, MessageCircle } from 'lucide-react';
import { apiFetch, BASE_URL } from '../api/client';
import AuthSheet from './Authsheet';
import { useAuth } from '../context/Authcontext';

/* ------------------------------------------------------------------ */
/*  Origine des fichiers statiques (images/vidéos servies par Express) */
/* ------------------------------------------------------------------ */
const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80';

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
  seller?: { id: string; name: string; avatar?: string; ratingAvg?: number; ratingCount?: number };
  location?: string;
  state?: string;
  quantity?: number;
  type?: string;
  videoUrl?: string | null;
  createdAt?: string;
  similar?: SimilarProduct[];
}

interface SimilarProduct {
  id: string;
  title: string;
  priceUSD: number;
  priceCDF: number;
  images: string[];
}

/** Étoiles en lecture seule pour la note moyenne du vendeur. */
function SellerStars({ avg, count }: { avg: number; count: number }) {
  if (!count) return null;
  const rounded = Math.round(avg);
  return (
    <div className="flex items-center gap-0.5" aria-label={`${avg.toFixed(1)} sur 5, ${count} avis`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rounded ? 'fill-orange-500 text-orange-500' : 'text-neutral-300'}`}
        />
      ))}
    </div>
  );
}

type ThemeMode = 'dark' | 'light' | 'system';

const readThemeMode = (): ThemeMode => {
  const saved = localStorage.getItem('cbfsoko-theme-mode');
  return saved === 'dark' || saved === 'system' ? saved : 'light';
};

const resolveDark = (mode: ThemeMode) =>
  mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

/* ------------------------------------------------------------------ */
/*  Page ProductDetails                                               */
/* ------------------------------------------------------------------ */

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login: authLogin } = useAuth();

  const [darkMode] = useState<boolean>(() => resolveDark(readThemeMode()));
  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const [quantity, setQuantity] = useState<number>(1);
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const deliveryRef = useRef<HTMLDivElement | null>(null);

  const [showAuth, setShowAuth] = useState<boolean>(false);

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

  /* ----------------------------- Chargement ----------------------------- */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setActiveIndex(0);
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

  // Arrivée depuis "Me faire livrer" (?livraison=1) : on descend directement sur le bloc livraison
  useEffect(() => {
    if (product && searchParams.get('livraison') === '1') {
      deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [product, searchParams]);

  /* ------------------------------- Actions ------------------------------- */
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  const handleGalleryScroll = () => {
    const el = galleryRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const scrollToDelivery = () => deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleAuthSuccess = (nextUser: User) => {
    authLogin(nextUser);
    setShowAuth(false);
  };

  const handleConfirmDelivery = () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    // À configurer plus tard : création de la commande avec livraison
    // (product.id, quantity, deliveryAddress) vers l'API des commandes.
  };

  /* ------------------------------ Dérivés ------------------------------ */
  const images = product?.images ?? [];
  const photoCount = images.length;
  const isRequest = String(product?.type || '').toUpperCase() === 'REQUEST';
  const maxQuantity = Math.max(1, product?.quantity ?? 99);
  const total = product ? Number((product.priceUSD * quantity).toFixed(2)) : 0;

  /* -------------------------------- Rendu -------------------------------- */
  return (
    <div className={`min-h-screen ${t.page}`}>
      <header className={`sticky top-0 z-40 ${t.borderStrong} ${t.header}`}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={goBack} className={iconBtn} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Link to="/" className="flex-1 truncate text-center text-xl font-black tracking-wider sm:text-2xl" aria-label="CBFSOKO, accueil">
            <span className="text-[#10b981]">CBF</span>
            <span className="text-[#f97316]">SOKO</span>
          </Link>
          <span className="h-10 w-10 flex-shrink-0" aria-hidden="true" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-16">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div className={`aspect-square animate-pulse rounded-2xl ${t.soft}`} />
            <div className="space-y-3">
              <div className={`h-7 w-3/4 animate-pulse rounded ${t.soft}`} />
              <div className={`h-6 w-1/3 animate-pulse rounded ${t.soft}`} />
              <div className={`h-24 animate-pulse rounded ${t.soft}`} />
            </div>
          </div>
        ) : error || !product ? (
          <div className={`rounded-2xl border border-dashed py-14 text-center ${t.border} ${t.surface}`}>
            <p className="text-sm font-semibold">Ce produit est introuvable.</p>
            <p className={`mt-1 text-xs ${t.muted}`}>Il a peut-être été retiré par le vendeur.</p>
            <Link to="/" className="mt-5 inline-flex rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
              Retour à l'accueil
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 md:gap-8">
            {/* ------------------------- Médias ------------------------- */}
            <div className="space-y-4">
              <div className={`relative overflow-hidden rounded-2xl ${t.border} ${t.soft}`}>
                <div
                  ref={galleryRef}
                  onScroll={handleGalleryScroll}
                  className="scrollbar-hide flex snap-x snap-mandatory overflow-x-auto"
                >
                  {(photoCount > 0 ? images : [undefined]).map((img, index) => (
                    <div key={index} className="aspect-square w-full flex-shrink-0 snap-center">
                      <img src={getMediaUrl(img)} alt={`${product.title}, photo ${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
                {photoCount > 1 && (
                  <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-neutral-950 px-2 py-1 text-xs font-bold leading-none text-white">
                    <Images className="h-3.5 w-3.5" aria-hidden="true" />
                    {Math.min(activeIndex + 1, photoCount)} / {photoCount}
                  </span>
                )}
              </div>

              {product.videoUrl && (
                <div>
                  <h2 className="mb-2 text-sm font-bold">Vidéo du produit</h2>
                  <video
                    src={getMediaUrl(product.videoUrl)}
                    poster={getMediaUrl(images[0])}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-[70vh] w-full rounded-2xl bg-black object-contain"
                  />
                </div>
              )}
            </div>

            {/* --------------------- Informations ---------------------- */}
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{product.title}</h2>
                <p className="mt-2 text-2xl font-bold text-orange-600">{product.priceUSD} $</p>
                {product.priceCDF > 0 && (
                  <p className={`text-sm ${t.muted}`}>{product.priceCDF.toLocaleString('fr-FR')} FC</p>
                )}
              </div>

              {!isRequest && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={scrollToDelivery}
                    className="flex-1 rounded-lg bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  >
                    Me faire livrer
                  </button>
                  <Link
                    to={`/products/${product.id}/renseignement`}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-3 text-sm font-bold transition-colors hover:border-orange-500 ${t.border} ${t.surface}`}
                  >
                    <Info className="h-4 w-4" />
                    Se renseigner
                  </Link>
                </div>
              )}

              <dl className={`divide-y rounded-2xl ${darkMode ? 'divide-neutral-800' : 'divide-neutral-200'} ${t.border} ${t.surface}`}>
                {product.category?.name && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={t.muted}>Catégorie</dt>
                    <dd className="font-semibold">{product.category.name}</dd>
                  </div>
                )}
                {product.state && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={t.muted}>État</dt>
                    <dd className="font-semibold">{product.state}</dd>
                  </div>
                )}
                {typeof product.quantity === 'number' && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={t.muted}>Quantité disponible</dt>
                    <dd className="font-semibold">{product.quantity}</dd>
                  </div>
                )}
                {product.location && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={t.muted}>Localisation</dt>
                    <dd className="flex items-center gap-1 font-semibold"><MapPin className="h-3.5 w-3.5 text-orange-600" />{product.location}</dd>
                  </div>
                )}
              </dl>

              {product.description && (
                <div>
                  <h3 className="mb-1.5 text-sm font-bold">Description</h3>
                  <p className={`whitespace-pre-line text-sm leading-relaxed ${t.muted}`}>{product.description}</p>
                </div>
              )}

              {product.seller && (
                <div className={`space-y-3 rounded-2xl p-4 ${t.border} ${t.surface}`}>
                  <h3 className={`text-xs font-bold uppercase tracking-wide ${t.muted}`}>Identité du vendeur</h3>
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-500 text-white">
                      {product.seller.avatar ? (
                        <img src={getMediaUrl(product.seller.avatar)} alt={product.seller.name} className="h-full w-full object-cover" />
                      ) : (
                        <Store className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{product.seller.name}</p>
                      {product.location && (
                        <p className={`flex items-center gap-1 text-xs ${t.muted}`}>
                          <MapPin className="h-3 w-3" />
                          {product.location}
                        </p>
                      )}
                      <SellerStars avg={product.seller.ratingAvg ?? 0} count={product.seller.ratingCount ?? 0} />
                    </div>
                  </div>
                  {/* Contact uniquement par message : pas d'appel, sur demande explicite */}
                  <Link
                    to={`/messages/${product.seller.id}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Contacter le vendeur
                  </Link>
                </div>
              )}

              {product.similar && product.similar.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold">Produits similaires</h3>
                  <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                    {product.similar.map((p) => (
                      <Link
                        key={p.id}
                        to={`/products/${p.id}`}
                        className={`w-32 flex-shrink-0 overflow-hidden rounded-xl ${t.border} ${t.surface}`}
                      >
                        <div className="aspect-square w-full overflow-hidden bg-neutral-100">
                          <img src={getMediaUrl(p.images?.[0])} alt={p.title} className="h-full w-full object-cover" />
                        </div>
                        <div className="p-2">
                          <p className="truncate text-xs font-semibold">{p.title}</p>
                          <p className="text-xs font-bold text-orange-600">{p.priceCDF > 0 ? `${p.priceCDF.toLocaleString('fr-FR')} FC` : `${p.priceUSD} $`}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* ------------------------ Livraison ------------------------ */}
              {!isRequest && (
                <div ref={deliveryRef} id="livraison" className={`scroll-mt-20 space-y-4 rounded-2xl border-2 border-orange-500 p-4 ${t.surface}`}>
                  <h3 className="text-base font-bold">Me faire livrer</h3>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold">Quantité</span>
                    <div className={`flex items-center rounded-lg ${t.border}`}>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        className="flex h-9 w-9 items-center justify-center disabled:opacity-40"
                        aria-label="Diminuer la quantité"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                        disabled={quantity >= maxQuantity}
                        className="flex h-9 w-9 items-center justify-center disabled:opacity-40"
                        aria-label="Augmenter la quantité"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="delivery-address" className="mb-1.5 block text-sm font-semibold">Adresse de livraison</label>
                    <textarea
                      id="delivery-address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      rows={2}
                      placeholder="Commune, quartier, avenue, numéro"
                      className={`w-full resize-none rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 ${t.border} ${t.soft}`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-lg font-bold text-orange-600">{total} $</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmDelivery}
                    className="w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  >
                    Confirmer la livraison
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showAuth && <AuthSheet onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />}
      </AnimatePresence>
    </div>
  );
}