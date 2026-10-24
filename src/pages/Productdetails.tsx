import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Heart, Images, Loader2, MapPin, Minus, Plus, Store, Info, Star, MessageCircle } from 'lucide-react';
import { apiFetch, BASE_URL } from '../api/client';
import { api, ApiError } from '../lib/http';
import { TourHelpButton, useGuidedTour } from '../components/guidedtour';
import { PRODUCT_TOUR } from '../components/guidedtour/tours';
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
          className={`h-3.5 w-3.5 ${n <= rounded ? 'fill-[#FF6B00] text-[#FF6B00]' : 'text-[#D0D5DD]'}`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page ProductDetails                                               */
/* ------------------------------------------------------------------ */

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login: authLogin } = useAuth();
  const loggedIn = !!user;

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const [quantity, setQuantity] = useState<number>(1);
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const deliveryRef = useRef<HTMLDivElement | null>(null);

  const [showAuth, setShowAuth] = useState<boolean>(false);

  const addressRef = useRef<HTMLTextAreaElement | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState<boolean>(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [favBusy, setFavBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 3500);
  };

  const iconBtn = 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#344054] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]';
  const card = 'rounded-2xl border border-[#EAECF0] bg-white';
  const muted = 'text-[#667085]';

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

  // Statut « favori » réel (base de données) pour l'utilisateur connecté
  useEffect(() => {
    if (!loggedIn || !id) { setIsFavorite(false); return; }
    let cancelled = false;
    api<{ ids: string[] }>('/favorites/ids')
      .then((res) => { if (!cancelled) setIsFavorite(res.ids.includes(id)); })
      .catch(() => { if (!cancelled) setIsFavorite(false); });
    return () => { cancelled = true; };
  }, [loggedIn, id]);

  /* ------------------------------- Actions ------------------------------- */
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  const handleGalleryScroll = () => {
    const el = galleryRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goToPhoto = (index: number) => {
    const el = galleryRef.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth * index, behavior: 'smooth' });
    setActiveIndex(index);
  };

  const scrollToDelivery = () => deliveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleAuthSuccess = (nextUser: User) => {
    authLogin(nextUser);
    setShowAuth(false);
  };

  const toggleFavorite = async () => {
    if (!user) { setShowAuth(true); return; }
    if (!product || favBusy) return;
    const next = !isFavorite;
    setFavBusy(true);
    setIsFavorite(next); // affichage immédiat, annulé si le serveur refuse
    try {
      await api(`/favorites/${product.id}`, { method: next ? 'POST' : 'DELETE' });
      flash(next ? 'Ajouté à vos favoris.' : 'Retiré de vos favoris.');
    } catch (e) {
      setIsFavorite(!next);
      if (e instanceof ApiError && e.status === 401) setShowAuth(true);
      else flash(e instanceof Error ? e.message : 'Action impossible pour le moment.');
    } finally {
      setFavBusy(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    if (!product || deliveryBusy) return;
    const address = deliveryAddress.trim();
    if (address.length < 5) {
      setDeliveryError('Indiquez votre adresse de livraison : commune, quartier, avenue, numéro.');
      addressRef.current?.focus();
      return;
    }
    setDeliveryError(null);
    setDeliveryBusy(true);
    try {
      await api('/orders/delivery-request', { method: 'POST', body: { productId: product.id, quantity, deliveryAddress: address } });
      navigate('/orders');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setShowAuth(true);
      else setDeliveryError(e instanceof Error ? e.message : 'La demande de livraison a échoué. Réessayez.');
    } finally {
      setDeliveryBusy(false);
    }
  };

  /* ------------------------------ Dérivés ------------------------------ */
  const images = product?.images ?? [];
  const photoCount = images.length;
  const isRequest = String(product?.type || '').toUpperCase() === 'REQUEST';
  const maxQuantity = Math.max(1, product?.quantity ?? 99);
  const total = product ? Number((product.priceUSD * quantity).toFixed(2)) : 0;

  /* ------------------------------- Tutoriel ------------------------------- */
  const { start, tour } = useGuidedTour({ id: 'product-details', steps: PRODUCT_TOUR, ready: !loading && !error && !!product });

  /* -------------------------------- Rendu -------------------------------- */
  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111111]">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={goBack} className={iconBtn} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">
            {product ? product.title : 'Produit'}
          </h1>
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={!product || favBusy}
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            data-tour="product-favorite"
            className={iconBtn}
          >
            <Heart className={`h-5 w-5 ${isFavorite ? 'fill-[#FF6B00] text-[#FF6B00]' : ''}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-4 pb-28 sm:px-6 sm:py-6 lg:px-8 lg:pb-16">
        {loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:gap-10" aria-busy="true">
            <div className="skeleton aspect-square w-full" />
            <div className="space-y-3">
              <div className="skeleton h-7 w-3/4" />
              <div className="skeleton h-8 w-1/3" />
              <div className="skeleton h-28 w-full" />
              <div className="skeleton h-20 w-full" />
            </div>
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
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:gap-10">
            {/* ------------------------- Médias ------------------------- */}
            <div className="space-y-3">
              <div data-tour="product-gallery" className="relative overflow-hidden rounded-2xl border border-[#EAECF0] bg-[#F2F4F7]">
                <div
                  ref={galleryRef}
                  onScroll={handleGalleryScroll}
                  className="scrollbar-hide no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
                >
                  {(photoCount > 0 ? images : [undefined]).map((img, index) => (
                    <div key={index} className="aspect-square w-full flex-shrink-0 snap-center">
                      <img src={getMediaUrl(img)} alt={`${product.title}, photo ${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
                {photoCount > 1 && (
                  <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-[#111111] px-2.5 py-1 text-xs font-bold leading-none text-white">
                    <Images className="h-3.5 w-3.5" aria-hidden="true" />
                    {Math.min(activeIndex + 1, photoCount)} / {photoCount}
                  </span>
                )}
              </div>

              {photoCount > 1 && (
                <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Photos du produit">
                  {images.map((img, index) => (
                    <button
                      key={index}
                      type="button"
                      role="tab"
                      aria-selected={index === activeIndex}
                      aria-label={`Photo ${index + 1}`}
                      onClick={() => goToPhoto(index)}
                      className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border-2 bg-[#F2F4F7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] sm:h-20 sm:w-20 ${index === activeIndex ? 'border-[#FF6B00]' : 'border-transparent hover:border-[#D0D5DD]'}`}
                    >
                      <img src={getMediaUrl(img)} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {product.videoUrl && (
                <div data-tour="product-video" className="pt-2">
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
            <div className="space-y-4 lg:sticky lg:top-20">
              <div data-tour="product-price" className={`${card} p-4 sm:p-5`}>
                <h2 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">{product.title}</h2>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-3xl font-extrabold text-[#FF6B00]">{product.priceUSD} $</p>
                  {product.priceCDF > 0 && (
                    <p className={`text-sm font-medium ${muted}`}>≈ {product.priceCDF.toLocaleString('fr-FR')} FC</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.state && (
                    <span className="rounded-full bg-[#F2F4F7] px-3 py-1 text-xs font-semibold text-[#344054]">{product.state}</span>
                  )}
                  {product.category?.name && (
                    <span className="rounded-full bg-[#F2F4F7] px-3 py-1 text-xs font-semibold text-[#344054]">{product.category.name}</span>
                  )}
                  {isRequest && (
                    <span className="rounded-full bg-[#FFF1E7] px-3 py-1 text-xs font-bold text-[#C94F00]">Demande</span>
                  )}
                </div>
              </div>

              {!isRequest && (
                <div className="hidden gap-2 lg:flex">
                  <button
                    type="button"
                    onClick={scrollToDelivery}
                    data-tour="product-deliver"
                    className="h-12 flex-1 rounded-full bg-[#FF6B00] px-4 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
                  >
                    Me faire livrer
                  </button>
                  <Link
                    to={`/products/${product.id}/renseignement`}
                    data-tour="product-info"
                    className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#D0D5DD] bg-white px-4 text-sm font-bold text-[#111111] transition-colors hover:border-[#FF6B00]"
                  >
                    <Info className="h-4 w-4" />
                    Se renseigner
                  </Link>
                </div>
              )}

              <dl className={`${card} divide-y divide-[#EAECF0]`}>
                {product.category?.name && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={muted}>Catégorie</dt>
                    <dd className="text-right font-semibold">{product.category.name}</dd>
                  </div>
                )}
                {product.state && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={muted}>État</dt>
                    <dd className="text-right font-semibold">{product.state}</dd>
                  </div>
                )}
                {typeof product.quantity === 'number' && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={muted}>Quantité disponible</dt>
                    <dd className="text-right font-semibold">{product.quantity}</dd>
                  </div>
                )}
                {product.location && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm">
                    <dt className={muted}>Localisation</dt>
                    <dd className="flex items-center gap-1 text-right font-semibold"><MapPin className="h-3.5 w-3.5 text-[#FF6B00]" />{product.location}</dd>
                  </div>
                )}
              </dl>

              {product.description && (
                <div className={`${card} p-4`}>
                  <h3 className="mb-1.5 text-sm font-bold">Description</h3>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[#344054]">{product.description}</p>
                </div>
              )}

              {product.seller && (
                <div data-tour="product-seller" className={`${card} space-y-3 p-4`}>
                  <h3 className={`text-xs font-bold uppercase tracking-wide ${muted}`}>Identité du vendeur</h3>
                  <Link
                    to={`/users/${product.seller.id}`}
                    className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                  >
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF6B00] text-white">
                      {product.seller.avatar ? (
                        <img src={getMediaUrl(product.seller.avatar)} alt={product.seller.name} className="h-full w-full object-cover" />
                      ) : (
                        <Store className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{product.seller.name}</p>
                      {product.location && (
                        <p className={`flex items-center gap-1 text-xs ${muted}`}>
                          <MapPin className="h-3 w-3" />
                          {product.location}
                        </p>
                      )}
                      <SellerStars avg={product.seller.ratingAvg ?? 0} count={product.seller.ratingCount ?? 0} />
                    </div>
                    <ChevronRight className={`h-5 w-5 flex-shrink-0 ${muted}`} aria-hidden="true" />
                  </Link>
                  {/* Contact uniquement par message : pas d'appel, sur demande explicite */}
                  <Link
                    to={`/messages/${product.seller.id}`}
                    data-tour="product-contact"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#D0D5DD] bg-white px-4 text-sm font-bold text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Contacter le vendeur
                  </Link>
                </div>
              )}

              {/* ------------------------ Livraison ------------------------ */}
              {!isRequest && (
                <div ref={deliveryRef} id="livraison" className="scroll-mt-20 space-y-4 rounded-2xl border-2 border-[#FF6B00] bg-white p-4 sm:p-5">
                  <h3 className="text-base font-bold">Me faire livrer</h3>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold">Quantité</span>
                    <div data-tour="product-quantity" className="flex items-center rounded-full border border-[#D0D5DD]">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"
                        aria-label="Diminuer la quantité"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                        disabled={quantity >= maxQuantity}
                        className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"
                        aria-label="Augmenter la quantité"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div data-tour="product-address">
                    <label htmlFor="delivery-address" className="mb-1.5 block text-sm font-semibold">Adresse de livraison</label>
                    <textarea
                      id="delivery-address"
                      ref={addressRef}
                      value={deliveryAddress}
                      onChange={(e) => { setDeliveryAddress(e.target.value); if (deliveryError) setDeliveryError(null); }}
                      aria-invalid={!!deliveryError}
                      aria-describedby={deliveryError ? 'delivery-error' : undefined}
                      rows={2}
                      placeholder="Commune, quartier, avenue, numéro"
                      className="w-full resize-none rounded-xl border border-[#D0D5DD] bg-[#F9FAFB] px-3 py-2.5 text-sm text-[#111111] outline-none focus:border-[#FF6B00]"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-[#EAECF0] pt-3">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="text-xl font-extrabold text-[#FF6B00]">{total} $</span>
                  </div>

                  {deliveryError && (
                    <p id="delivery-error" role="alert" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      {deliveryError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleConfirmDelivery}
                    disabled={deliveryBusy}
                    data-tour="product-confirm"
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FF6B00] px-4 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {deliveryBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {deliveryBusy ? 'Envoi en cours…' : 'Confirmer la livraison'}
                  </button>
                </div>
              )}

              {product.similar && product.similar.length > 0 && (
                <div data-tour="product-similar">
                  <h3 className="mb-2 text-sm font-bold">Produits similaires</h3>
                  <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                    {product.similar.map((p) => (
                      <Link
                        key={p.id}
                        to={`/products/${p.id}`}
                        className="w-36 flex-shrink-0 overflow-hidden rounded-xl border border-[#EAECF0] bg-white transition-colors hover:border-[#D0D5DD]"
                      >
                        <div className="aspect-square w-full overflow-hidden bg-[#F2F4F7]">
                          <img src={getMediaUrl(p.images?.[0])} alt={p.title} className="h-full w-full object-cover" />
                        </div>
                        <div className="p-2.5">
                          <p className="truncate text-xs font-semibold">{p.title}</p>
                          <p className="text-sm font-bold text-[#FF6B00]">{p.priceCDF > 0 ? `${p.priceCDF.toLocaleString('fr-FR')} FC` : `${p.priceUSD} $`}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* BARRE D'ACTION (mobile) : prix + action principale, la navigation globale est masquée sur cette page */}
      {!loading && !error && product && !isRequest && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EAECF0] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0">
              <p className="text-lg font-extrabold leading-tight text-[#FF6B00]">{product.priceUSD} $</p>
              {product.priceCDF > 0 && <p className={`truncate text-xs ${muted}`}>{product.priceCDF.toLocaleString('fr-FR')} FC</p>}
            </div>
            <Link
              to={`/products/${product.id}/renseignement`}
              aria-label="Se renseigner"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-[#D0D5DD] bg-white text-[#111111]"
            >
              <Info className="h-5 w-5" />
            </Link>
            <button
              type="button"
              onClick={scrollToDelivery}
              className="h-12 flex-1 rounded-full bg-[#FF6B00] px-4 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
            >
              Me faire livrer
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white shadow-lg">
          {notice}
        </div>
      )}

      {!loading && !error && product && <TourHelpButton onClick={start} />}
      {tour}

      <AnimatePresence>
        {showAuth && <AuthSheet onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} />}
      </AnimatePresence>
    </div>
  );
}
