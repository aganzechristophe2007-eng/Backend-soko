import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Camera, Package, Search, ShieldCheck, Sparkles, Store, Truck, Wallet, Megaphone } from 'lucide-react';
import NotificationBadge from './NotificationBadge';

/**
 * Bannière d'accueil : l'image reste 3 secondes, puis glisse vers la gauche pour laisser entrer
 * (par la droite) un panneau blanc avec des liens cliquables pour parcourir la plateforme.
 * Boucle automatique, pause au survol / focus / toucher, points de navigation, balayage tactile.
 * `prefers-reduced-motion` : pas de défilement automatique ni d'animation (navigation manuelle).
 */

const IMAGE_MS = 3000;
const PANEL_MS = 8000;

interface Props {
  signedIn: boolean;
  sellerRoute: string;
  newShops: number;
  onSignup: () => void;
  onPost: () => void;
  onOrders: () => void;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2';

export default function HeroCarousel({ signedIn, sellerRoute, newShops, onSignup, onPost, onOrders }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const touchX = useRef<number | null>(null);

  const go = useCallback((next: number) => setIndex(((next % 2) + 2) % 2), []);

  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % 2), index === 0 ? IMAGE_MS : PANEL_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, reduced]);

  const slideStyle = (active: boolean): React.CSSProperties => ({
    visibility: active ? 'visible' : 'hidden', // la diapositive masquée n'est plus atteignable au clavier
    transition: reduced ? 'none' : `visibility 0s linear ${active ? '0s' : '0.7s'}`,
  });

  const cards: { key: string; label: string; hint: string; icon: React.ReactNode; to?: string; onClick?: () => void; badge?: number }[] = [
    { key: 'products', label: 'Parcourir les produits', hint: 'Neuf et occasion', icon: <Search className="h-5 w-5" aria-hidden="true" />, to: '/products' },
    { key: 'shops', label: 'Boutiques partenaires', hint: newShops > 0 ? `${newShops} nouvelle${newShops > 1 ? 's' : ''}` : 'Vendeurs de confiance', icon: <Store className="h-5 w-5" aria-hidden="true" />, to: '/boutique', badge: newShops },
    { key: 'sell', label: 'Créer ma boutique', hint: 'Vendez en toute simplicité', icon: <Megaphone className="h-5 w-5" aria-hidden="true" />, to: sellerRoute },
    { key: 'orders', label: 'Suivre mes commandes', hint: 'Livraison en cours', icon: <Package className="h-5 w-5" aria-hidden="true" />, onClick: onOrders },
  ];

  const cardClass = `group relative flex items-center gap-2.5 rounded-xl border border-[#EAECF0] bg-white/90 p-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#FFC9A3] hover:shadow-[0_6px_18px_rgba(255,107,0,0.12)] sm:p-3 ${FOCUS}`;

  const cardInner = (c: (typeof cards)[number]) => (
    <>
      <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#FFF1E7] text-[#FF6B00] transition-colors group-hover:bg-[#FF6B00] group-hover:text-white sm:h-10 sm:w-10">
        {c.icon}
        {c.badge ? <NotificationBadge count={c.badge} tone="new" srLabel="nouvelles boutiques" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-[#111111] sm:text-sm">{c.label}</span>
        <span className={`block truncate text-[11px] sm:text-xs ${c.badge ? 'font-semibold text-[#12B76A]' : 'text-[#667085]'}`}>{c.hint}</span>
      </span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-[#98A2B3] transition-transform group-hover:translate-x-0.5 group-hover:text-[#FF6B00]" aria-hidden="true" />
    </>
  );

  return (
    <div
      role="region"
      aria-roledescription="carrousel"
      aria-label="Bannière CBF SOKO"
      className="relative overflow-hidden rounded-2xl border border-[#EAECF0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] sm:rounded-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setPaused(true); }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        setPaused(false);
        if (start === null) return;
        const dx = e.changedTouches[0].clientX - start;
        if (dx < -40) go(index + 1);
        else if (dx > 40) go(index - 1);
      }}
    >
      <div
        className="flex items-stretch"
        style={{ transform: `translateX(-${index * 100}%)`, transition: reduced ? 'none' : 'transform 700ms cubic-bezier(0.22, 0.8, 0.26, 1)' }}
      >
        {/* DIAPOSITIVE 1 : image (lien vers les produits) */}
        <div className="flex w-full flex-shrink-0 items-center bg-white" style={slideStyle(index === 0)} aria-hidden={index !== 0}>
          <Link to="/products" aria-label="Explorer maintenant" className={`block w-full ${FOCUS}`} tabIndex={index === 0 ? 0 : -1}>
            <img
              src="/hero-banner.png"
              alt="Des produits fiables, près de chez vous. Neuf ou d'occasion, trouvez ce qu'il vous faut au meilleur prix à Bukavu et partout en RDC. Explorer maintenant."
              decoding="async"
              className="block h-auto w-full"
            />
          </Link>
        </div>

        {/* DIAPOSITIVE 2 : panneau blanc avec liens */}
        <div className="relative w-full flex-shrink-0 overflow-hidden bg-white" style={slideStyle(index === 1)} aria-hidden={index !== 1}>
          {/* Décorations : halos orange/vert, trame de points, arcs fins */}
          <span aria-hidden="true" className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full bg-[#FFE4D1] opacity-70 blur-3xl" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-1/4 h-52 w-52 rounded-full bg-[#D1FADF] opacity-60 blur-3xl" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-[0.14] [mask-image:linear-gradient(to_left,black,transparent)]"
            style={{ backgroundImage: 'radial-gradient(#FF6B00 1.2px, transparent 1.2px)', backgroundSize: '16px 16px' }}
          />
          <span aria-hidden="true" className="pointer-events-none absolute -left-8 top-1/2 hidden h-40 w-40 -translate-y-1/2 rounded-full border-2 border-dashed border-[#FFD2B0] sm:block" />
          <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-[#FF6B00] via-[#FFB27A] to-[#12B76A]" />

          <div className="relative z-10 grid min-h-full gap-3 p-4 sm:gap-5 sm:p-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-6 lg:p-8">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FFE0CC] bg-[#FFF8F3] px-2.5 py-1 text-[10px] font-semibold text-[#B54708] sm:text-xs">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                La marketplace de Bukavu et de toute la RDC
              </span>
              <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-tight text-[#111111] sm:mt-3 sm:text-3xl">
                Rejoignez <span className="text-[#FF6B00]">CBF SOKO</span>
              </h2>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-[#667085] sm:text-sm">
                Achetez, vendez et faites-vous livrer en toute confiance, près de chez vous.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
                {signedIn ? (
                  <button type="button" onClick={onPost} tabIndex={index === 1 ? 0 : -1} className={`inline-flex items-center gap-2 rounded-full bg-[#FF6B00] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#FF6B00]/25 transition hover:bg-[#E85F00] active:scale-[0.98] sm:px-5 sm:text-sm ${FOCUS}`}>
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Publier une annonce
                  </button>
                ) : (
                  <button type="button" onClick={onSignup} tabIndex={index === 1 ? 0 : -1} className={`inline-flex items-center gap-2 rounded-full bg-[#FF6B00] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-[#FF6B00]/25 transition hover:bg-[#E85F00] active:scale-[0.98] sm:px-5 sm:text-sm ${FOCUS}`}>
                    Inscrivez-vous maintenant
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
                <Link to="/products" tabIndex={index === 1 ? 0 : -1} className={`inline-flex items-center gap-1.5 rounded-full border border-[#D0D5DD] bg-white px-4 py-2.5 text-xs font-semibold text-[#111111] transition hover:border-[#FF6B00] hover:text-[#FF6B00] sm:text-sm ${FOCUS}`}>
                  Explorer les produits
                </Link>
              </div>

              <ul className="mt-3 hidden flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-[#475467] sm:flex sm:text-xs">
                <li className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-[#FF6B00]" aria-hidden="true" />Livraison par coursier</li>
                <li className="inline-flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-[#FF6B00]" aria-hidden="true" />Paiement Mobile Money</li>
                <li className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#12B76A]" aria-hidden="true" />Boutiques vérifiées</li>
              </ul>
            </div>

            <ul className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
              {cards.map((c) => (
                <li key={c.key} className="min-w-0">
                  {c.to ? (
                    <Link to={c.to} tabIndex={index === 1 ? 0 : -1} className={`${cardClass} h-full`}>{cardInner(c)}</Link>
                  ) : (
                    <button type="button" onClick={c.onClick} tabIndex={index === 1 ? 0 : -1} className={`${cardClass} h-full w-full`}>{cardInner(c)}</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Points de navigation */}
      <div className="absolute inset-x-0 bottom-2 z-20 flex justify-center gap-1.5">
        {[0, 1].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Afficher la bannière ${i + 1} sur 2`}
            aria-current={index === i}
            className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${index === i ? 'w-6 bg-[#FF6B00]' : 'w-2 bg-[#D0D5DD] hover:bg-[#98A2B3]'}`}
          />
        ))}
      </div>
    </div>
  );
}
