import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Heart, Images, MapPin, Store, Info, Star, MessageCircle, Share2, Truck, Palmtree, Package, ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { api, ApiError } from '../lib/http';
import { getMediaUrl } from '../lib/media';
import { TourHelpButton, useGuidedTour } from '../components/guidedtour';
import { PRODUCT_TOUR } from '../components/guidedtour/tours';
import DeliveryModal from '../components/DeliveryModal';
import AuthSheet from './Authsheet';
import { useAuth } from '../context/Authcontext';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ProductItem {
  id: string;
  title: string;
  description?: string;
  priceUSD: number;
  priceCDF: number;
  category?: { id: string; name: string };
  images: string[];
  seller?: { id: string; name: string; avatar?: string; ratingAvg?: number; ratingCount?: number; onVacation?: boolean; vacationNote?: string };
  location?: string;
  state?: string;
  quantity?: number;
  type?: string;
  isSold?: boolean;
  negotiable?: boolean;
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

const STATE_LABELS: Record<string, string> = {
  NEUF: 'Neuf',
  OCCASION_BON_ETAT: 'Occasion, bon état',
  OCCASION_MOYEN: 'Occasion, état moyen',
};

/** Étoiles en lecture seule pour la note moyenne du vendeur. */
function SellerStars({ avg, count }: { avg: number; count: number }) {
  if (!count) return null;
  const rounded = Math.round(avg);
  return (
    <div className="flex items-center gap-1" aria-label={`${avg.toFixed(1)} sur 5, ${count} avis`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={`h-3.5 w-3.5 ${n <= rounded ? 'fill-[#FF6B00] text-[#FF6B00]' : 'text-[#D0D5DD]'}`} />
        ))}
      </div>
      <span className="text-xs font-semibold text-[#667085]">{avg.toFixed(1)} ({count})</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page ProductDetails                                               */
/* ------------------------------------------------------------------ */

export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login: authLogin } = useAuth() as any;
  const loggedIn = !!user;

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const [showAuth, setShowAuth] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<'deliver' | 'contact' | 'info' | null>(null);
  const [showDelivery, setShowDelivery] = useState<boolean>(false);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [favBusy, setFavBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 3500);
  };

  const iconBtn = 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#F2F4F7] text-[#344054] transition-colors hover:bg-[#EAECF0] focus-visible:outline-none focus-visible:bg-[#EAECF0]';
  const muted = 'text-[#667085]';

  /* ----------------------------- Chargement ----------------------------- */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setActiveIndex(0);
    apiFetch(`/products/${id}`)
      .then((data: any) => {
        if (cancelled) return;
        const item = (data?.product ?? data?.data ?? data) as ProductItem;
        setProduct(item && item.id ? item : null);
        if (!item || !item.id) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Statut « favori » réel (base de données) pour l'utilisateur connecté
  useEffect(() => {
    if (!loggedIn || !id) { setIsFavorite(false); return; }
    let cancelled = false;
    api<{ ids: string[] }>('/favorites/ids')
      .then((res) => { if (!cancelled) setIsFavorite(res.ids.includes(id)); })
      .catch(() => { if (!cancelled) setIsFavorite(false); });
    return () => { cancelled = true; };
  }, [loggedIn, id]);

  /* ------------------------------ Dérivés ------------------------------ */
  const images = product?.images ?? [];
  const photoCount = images.length;
  const isRequest = String(product?.type || '').toUpperCase() === 'REQUEST';
  const isOwner = !!product?.seller?.id && product.seller.id === user?.id;
  const onVacation = !!product?.seller?.onVacation;
  const soldOut = !!product?.isSold || (typeof product?.quantity === 'number' && product.quantity <= 0);
  const canOrder = !!product && !isRequest && !isOwner && !onVacation && !soldOut;
  const lowStock = typeof product?.quantity === 'number' && product.quantity > 0 && product.quantity <= 3;

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

  const runAction = (action: 'deliver' | 'contact' | 'info') => {
    if (!product) return;
    if (action === 'info') { navigate(`/products/${product.id}/renseignement`); return; }
    if (action === 'deliver') { setShowDelivery(true); return; }
    if (action === 'contact' && product.seller) {
      navigate('/messages', { state: { partner: { id: product.seller.id, name: product.seller.name, avatar: product.seller.avatar ?? null } } });
    }
  };

  // Livraison et contact exigent d'être connecté : on demande la connexion, puis on reprend l'action.
  const requireLogin = (action: 'deliver' | 'contact' | 'info') => {
    if (action === 'info' || loggedIn) { runAction(action); return; }
    setPendingAction(action);
    setShowAuth(true);
  };

  const handleAuthSuccess = (nextUser: any) => {
    authLogin(nextUser);
    setShowAuth(false);
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      window.setTimeout(() => runAction(action), 0);
    }
  };

  // Arrivée depuis « Me faire livrer » ailleurs dans l'app (?livraison=1) : ouvre directement la fenêtre.
  useEffect(() => {
    if (product && searchParams.get('livraison') === '1' && loggedIn && canOrder) {
      setShowDelivery(true);
      const next = new URLSearchParams(searchParams);
      next.delete('livraison');
      setSearchParams(next, { replace: true });
    }
  }, [product, searchParams, loggedIn, canOrder, setSearchParams]);

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

  const share = async () => {
    if (!product) return;
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.title, text: `${product.title} sur CBF SOKO`, url });
      else { await navigator.clipboard.writeText(url); flash('Lien copié.'); }
    } catch { /* partage annulé par l'utilisateur */ }
  };

  /* ------------------------------- Tutoriel ------------------------------- */
  const { start, tour } = useGuidedTour({ id: 'product-details', steps: PRODUCT_TOUR, ready: !loading && !error && !!product });

  const deliverLabel = soldOut ? 'Indisponible' : onVacation ? 'Vendeur en vacances' : 'Me faire livrer';

  const actionButtons = (
    <>
      <button
        type="button"
        onClick={() => requireLogin('deliver')}
        disabled={!canOrder}
        data-tour="product-deliver"
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-4 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:brightness-90 disabled:bg-[#D0D5DD] disabled:text-[#667085]"
      >
        <Truck className="h-4 w-4" aria-hidden="true" />
        {deliverLabel}
      </button>
      <button
        type="button"
        onClick={() => requireLogin('info')}
        data-tour="product-info"
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#F2F4F7] px-4 text-sm font-bold text-[#111111] transition-colors hover:bg-[#EAECF0] focus-visible:outline-none focus-visible:bg-[#EAECF0]"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
        Me renseigner
      </button>
    </>
  );

  /* -------------------------------- Rendu -------------------------------- */
  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <header className="sticky top-0 z-40 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={goBack} className={iconBtn} aria-label="Retour">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">{product ? product.title : 'Produit'}</h1>
          <button type="button" onClick={share} disabled={!product} aria-label="Partager" className={iconBtn}>
            <Share2 className="h-5 w-5" />
          </button>
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

      <main className="mx-auto w-full max-w-6xl px-4 py-4 pb-32 sm:px-6 sm:py-6 lg:px-8 lg:pb-16">
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
          <div className="rounded-2xl bg-[#F2F4F7] px-4 py-16 text-center">
            <p className="text-base font-bold">Ce produit est introuvable.</p>
            <p className={`mt-1 text-sm ${muted}`}>Il a peut-être été retiré par le vendeur.</p>
            <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#FF6B00] px-6 text-sm font-bold text-white transition-colors hover:bg-[#E85F00]">
              Retour à l'accueil
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)] lg:gap-10">
            {/* ------------------------- Médias ------------------------- */}
            <div className="space-y-3">
              <div data-tour="product-gallery" className="relative overflow-hidden rounded-3xl bg-[#F2F4F7]">
                <div ref={galleryRef} onScroll={handleGalleryScroll} className="scrollbar-hide no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
                  {(photoCount > 0 ? images : [undefined]).map((img, index) => (
                    <div key={index} className="aspect-square w-full flex-shrink-0 snap-center">
                      <img src={getMediaUrl(img)} alt={`${product.title}, photo ${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
                {soldOut && (
                  <span className="absolute left-3 top-3 rounded-full bg-[#111111] px-3 py-1 text-xs font-bold text-white">Vendu</span>
                )}
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
                      className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#F2F4F7] transition-opacity focus-visible:outline-none sm:h-20 sm:w-20 ${index === activeIndex ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
                    >
                      <img src={getMediaUrl(img)} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {product.videoUrl && (
                <div data-tour="product-video" className="pt-2">
                  <h2 className="mb-2 text-sm font-bold">Vidéo du produit</h2>
                  <video src={getMediaUrl(product.videoUrl)} poster={getMediaUrl(images[0])} controls playsInline preload="metadata" className="max-h-[70vh] w-full rounded-2xl bg-black object-contain" />
                </div>
              )}
            </div>

            {/* --------------------- Informations ---------------------- */}
            <div className="space-y-4 lg:sticky lg:top-20">
              <div data-tour="product-price" className="rounded-3xl bg-[#F2F4F7] p-5">
                <h2 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl">{product.title}</h2>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-3xl font-extrabold text-[#FF6B00]">{product.priceUSD} $</p>
                  {product.priceCDF > 0 && <p className={`text-sm font-medium ${muted}`}>≈ {product.priceCDF.toLocaleString('fr-FR')} FC</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.state && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#344054]">{STATE_LABELS[product.state] ?? product.state}</span>}
                  {product.category?.name && <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#344054]">{product.category.name}</span>}
                  {isRequest && <span className="rounded-full bg-[#FFF1E7] px-3 py-1 text-xs font-bold text-[#C94F00]">Demande</span>}
                  {!isRequest && <span className={`rounded-full px-3 py-1 text-xs font-bold ${product.negotiable ? 'bg-[#FF6B00] text-white' : 'bg-white text-[#344054]'}`}>{product.negotiable ? 'Prix négociable' : 'Prix fixe'}</span>}
                  {lowStock && <span className="rounded-full bg-[#FFF1E7] px-3 py-1 text-xs font-bold text-[#C94F00]">Plus que {product.quantity} en stock</span>}
                </div>
                {!isRequest && (
                  <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-[#344054]">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#FF6B00]" aria-hidden="true" />
                    Un livreur CBF SOKO vérifie l'article avant que vous ne payiez. Livraison à 2 000 FC, ou retrait gratuit chez le vendeur.
                  </p>
                )}
              </div>

              {onVacation && (
                <p className="flex items-start gap-2 rounded-2xl bg-[#FFF1E7] p-4 text-sm font-medium text-[#C94F00]" role="status">
                  <Palmtree className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span>Ce vendeur est en vacances, les commandes sont suspendues.{product.seller?.vacationNote ? ` ${product.seller.vacationNote}` : ''}</span>
                </p>
              )}

              {!isRequest && !isOwner && <div className="hidden gap-2 lg:flex">{actionButtons}</div>}
              {isOwner && <p className="rounded-2xl bg-[#F2F4F7] p-4 text-sm text-[#667085]">C'est votre annonce. Gérez-la depuis vos paramètres.</p>}

              <dl className="divide-y divide-[#EAECF0] rounded-2xl bg-[#F2F4F7]">
                {product.category?.name && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm"><dt className={muted}>Catégorie</dt><dd className="text-right font-semibold">{product.category.name}</dd></div>
                )}
                {product.state && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm"><dt className={muted}>État</dt><dd className="text-right font-semibold">{STATE_LABELS[product.state] ?? product.state}</dd></div>
                )}
                {typeof product.quantity === 'number' && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm"><dt className={muted}>Quantité disponible</dt><dd className="text-right font-semibold">{product.quantity}</dd></div>
                )}
                {product.location && (
                  <div className="flex justify-between gap-4 px-4 py-3 text-sm"><dt className={muted}>Localisation</dt><dd className="flex items-center gap-1 text-right font-semibold"><MapPin className="h-3.5 w-3.5 text-[#FF6B00]" />{product.location}</dd></div>
                )}
              </dl>

              {product.description && (
                <div className="rounded-2xl bg-[#F2F4F7] p-4">
                  <h3 className="mb-1.5 text-sm font-bold">Description</h3>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[#344054]">{product.description}</p>
                </div>
              )}

              {product.seller && (
                <div data-tour="product-seller" className="space-y-3 rounded-2xl bg-[#F2F4F7] p-4">
                  <h3 className={`text-xs font-bold uppercase tracking-wide ${muted}`}>Identité du vendeur</h3>
                  <Link to={`/users/${product.seller.id}`} className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:bg-[#EAECF0]">
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF6B00] text-white">
                      {product.seller.avatar ? <img src={getMediaUrl(product.seller.avatar)} alt={product.seller.name} className="h-full w-full object-cover" /> : <Store className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{product.seller.name}</p>
                      {product.location && <p className={`flex items-center gap-1 text-xs ${muted}`}><MapPin className="h-3 w-3" />{product.location}</p>}
                      <SellerStars avg={product.seller.ratingAvg ?? 0} count={product.seller.ratingCount ?? 0} />
                    </div>
                    <ChevronRight className={`h-5 w-5 flex-shrink-0 ${muted}`} aria-hidden="true" />
                  </Link>
                  {!isOwner && (
                    <button
                      type="button"
                      onClick={() => requireLogin('contact')}
                      data-tour="product-contact"
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-[#111111] transition-colors hover:bg-[#EAECF0] focus-visible:outline-none focus-visible:bg-[#EAECF0]"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Contacter le vendeur
                    </button>
                  )}
                </div>
              )}

              {product.similar && product.similar.length > 0 && (
                <div data-tour="product-similar">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><Package className="h-4 w-4 text-[#FF6B00]" aria-hidden="true" /> Produits similaires</h3>
                  <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                    {product.similar.map((p) => (
                      <Link key={p.id} to={`/products/${p.id}`} className="w-36 flex-shrink-0 overflow-hidden rounded-xl bg-[#F2F4F7] transition-opacity hover:opacity-90">
                        <div className="aspect-square w-full overflow-hidden bg-[#EAECF0]">
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

      {/* BARRE D'ACTION (mobile) : prix + actions principales */}
      {!loading && !error && product && !isRequest && !isOwner && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0">
              <p className="text-lg font-extrabold leading-tight text-[#FF6B00]">{product.priceUSD} $</p>
              {product.priceCDF > 0 && <p className={`truncate text-xs ${muted}`}>{product.priceCDF.toLocaleString('fr-FR')} FC</p>}
            </div>
            {actionButtons}
          </div>
        </div>
      )}

      {notice && (
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-28 z-50 mx-auto w-fit max-w-[90vw] rounded-full bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white">
          {notice}
        </div>
      )}

      {!loading && !error && product && <TourHelpButton onClick={start} />}
      {tour}

      {showDelivery && product && canOrder && (
        <DeliveryModal
          product={{ id: product.id, title: product.title, priceUSD: product.priceUSD, priceCDF: product.priceCDF, quantity: product.quantity, images: product.images, seller: product.seller ? { id: product.seller.id, name: product.seller.name } : undefined }}
          onClose={() => setShowDelivery(false)}
        />
      )}

      <AnimatePresence>
        {showAuth && <AuthSheet onClose={() => { setShowAuth(false); setPendingAction(null); }} onSuccess={handleAuthSuccess} />}
      </AnimatePresence>
    </div>
  );
}
