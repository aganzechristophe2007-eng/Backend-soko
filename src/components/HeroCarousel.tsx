import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Camera, ChevronLeft, ChevronRight, Megaphone, Package, Search, Store, UserPlus } from 'lucide-react';
import NotificationBadge from './NotificationBadge';

/**
 * Bannières CBF SOKO.
 *
 * - HeroCarousel (haut de page) : une bannière par lien. L'image d'accueil, puis une bannière
 *   dédiée pour chaque destination (inscription ou publication, produits, boutiques, création de
 *   boutique, commandes).
 * - AdvantagesCarousel (bas de page) : bannières qui présentent les avantages de CBF SOKO.
 *
 * Transition : glissement + fondu selon la direction, apparition échelonnée du contenu.
 * Défilement automatique, mis en pause au survol, au focus et au toucher.
 * Balayage tactile, flèches (ordinateur), flèches du clavier, points cliquables.
 * `prefers-reduced-motion` : pas de défilement automatique, simples fondus.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const IMAGE_MS = 4000;
const TEXT_MS = 5500;

interface BaseSlide {
  id: string;
  to?: string; // route interne (commence par "/")
  onClick?: () => void; // ou action
  ms?: number; // durée d'affichage propre à cette bannière
}

export interface ImageSlide extends BaseSlide {
  image: string;
  alt: string;
}

export interface TextSlide extends BaseSlide {
  icon: React.ReactNode;
  kicker?: string;
  title: string;
  text: string;
  cta: string;
  bg: string; // fond de la bannière
  fg: string; // texte
  accent: string; // pastille de l'icône et sur-titre
  accentFg: string; // icône dans la pastille
  ctaBg: string; // bouton
  ctaFg: string;
  badge?: number; // pastille "nouveau" sur l'icône
  badgeLabel?: string;
}

export type BannerSlide = ImageSlide | TextSlide;

const isImage = (s: BannerSlide): s is ImageSlide => 'image' in s;

// Seules les routes internes sont acceptées (rejette "//" et les URL externes).
const safeTo = (to?: string) => (to && to.startsWith('/') && !to.startsWith('//') ? to : undefined);

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]';

const slideVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '30%' : '-30%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-30%' : '30%', opacity: 0 }),
};

const fadeVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

interface ActionProps {
  slide: BannerSlide;
  className: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  children: React.ReactNode;
}

function Action({ slide, className, style, ariaLabel, children }: ActionProps) {
  const to = safeTo(slide.to);
  if (to) {
    return (
      <Link to={to} className={className} style={style} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={slide.onClick} className={className} style={style} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

interface CarouselProps {
  slides: BannerSlide[];
  label: string;
  className?: string;
  variant: 'hero' | 'compact';
}

function Carousel({ slides, label, className = '', variant }: CarouselProps) {
  const n = slides.length;
  const reduce = !!useReducedMotion();
  const [[index, dir], setPage] = useState<[number, number]>([0, 0]);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0); // permet de réarmer le minuteur sans changer de bannière
  const dragged = useRef(false);

  // Quand la liste change (ex. connexion), on repart de la première bannière.
  useEffect(() => {
    setPage([0, 0]);
  }, [n]);

  const go = useCallback(
    (d: number) => {
      if (n < 2) return;
      setPage(([i]) => [(i + d + n) % n, d]);
    },
    [n]
  );

  const goTo = (target: number) => setPage(([cur]) => (target === cur ? [cur, 0] : [target, target > cur ? 1 : -1]));

  const current = slides[Math.min(index, n - 1)];

  // Défilement automatique : la durée dépend de la bannière affichée.
  useEffect(() => {
    if (n < 2 || paused || reduce || !current) return;
    const delay = current.ms ?? (isImage(current) ? IMAGE_MS : TEXT_MS);
    const timer = window.setTimeout(() => {
      if (!document.hidden) go(1);
      else setTick((t) => t + 1); // onglet masqué : on réarme sans avancer
    }, delay);
    return () => window.clearTimeout(timer);
  }, [n, paused, reduce, current, index, tick, go]);

  if (n === 0 || !current) return null;

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { y: 14, opacity: 0 },
          animate: { y: 0, opacity: 1 },
          transition: { delay, duration: 0.45, ease: EASE },
        };

  return (
    <div
      role="region"
      aria-roledescription="carrousel"
      aria-label={label}
      className={`relative overflow-hidden bg-[#FFF1E7] ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        else if (e.key === 'ArrowRight') go(1);
      }}
    >
      <AnimatePresence initial={false} custom={dir}>
        <motion.div
          key={current.id}
          custom={dir}
          variants={reduce ? fadeVariants : slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: reduce ? 0.2 : 0.6, ease: EASE }}
          drag={n > 1 && !reduce ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragStart={() => {
            dragged.current = true;
          }}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) go(1);
            else if (info.offset.x > 60) go(-1);
            window.setTimeout(() => {
              dragged.current = false;
            }, 0);
          }}
          // Un balayage ne doit pas déclencher le lien de la bannière.
          onClickCapture={(e) => {
            if (dragged.current) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className="absolute inset-0"
          aria-roledescription="diapositive"
          aria-label={`${Math.min(index, n - 1) + 1} sur ${n}`}
        >
          {isImage(current) ? (
            <Action slide={current} className={`block h-full w-full bg-white ${FOCUS}`}>
              <img
                src={current.image}
                alt={current.alt}
                draggable={false}
                decoding="async"
                className="h-full w-full object-contain"
              />
            </Action>
          ) : variant === 'hero' ? (
            <div
              className="relative flex h-full items-center justify-between gap-4 overflow-hidden px-5 pb-9 pt-4 sm:gap-8 sm:px-10"
              style={{ background: current.bg, color: current.fg }}
            >
              {/* Forme décorative pleine (sans dégradé ni halo) */}
              <motion.span
                aria-hidden="true"
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.14 }}
                transition={{ delay: 0.1, duration: 0.7, ease: EASE }}
                className="pointer-events-none absolute -bottom-16 -right-12 h-56 w-56 rounded-full sm:h-80 sm:w-80"
                style={{ background: current.accent }}
              />

              <div className="relative z-10 min-w-0 flex-1">
                {current.kicker && (
                  <motion.p
                    {...rise(0.15)}
                    className="text-[11px] font-bold uppercase tracking-wide sm:text-xs"
                    style={{ color: current.accent }}
                  >
                    {current.kicker}
                  </motion.p>
                )}
                <motion.h2 {...rise(0.22)} className="mt-1 text-xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                  {current.title}
                </motion.h2>
                <motion.p {...rise(0.3)} className="mt-1.5 max-w-md text-xs font-medium leading-snug sm:mt-2 sm:text-base">
                  {current.text}
                </motion.p>
                <motion.div {...rise(0.38)} className="mt-3 sm:mt-5">
                  <Action
                    slide={current}
                    className={`inline-flex items-center rounded-full px-4 py-2.5 text-xs font-bold transition-transform active:scale-95 sm:px-7 sm:py-3 sm:text-sm ${FOCUS}`}
                    style={{ background: current.ctaBg, color: current.ctaFg }}
                  >
                    {current.cta}
                  </Action>
                </motion.div>
              </div>

              <motion.div
                initial={reduce ? false : { scale: 0.5, opacity: 0, rotate: -12 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 16 }}
                className="relative z-10 flex-shrink-0"
                aria-hidden="true"
              >
                <motion.div
                  animate={reduce ? undefined : { y: [0, -8, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative flex h-20 w-20 items-center justify-center rounded-full sm:h-36 sm:w-36 [&_svg]:h-9 [&_svg]:w-9 sm:[&_svg]:h-16 sm:[&_svg]:w-16"
                  style={{ background: current.accent, color: current.accentFg }}
                >
                  {current.icon}
                  <NotificationBadge count={current.badge ?? 0} tone="new" srLabel={current.badgeLabel} />
                </motion.div>
              </motion.div>
            </div>
          ) : (
            <div
              className="flex h-full items-center gap-3 px-5 pb-7 sm:gap-5 sm:px-10"
              style={{ background: current.bg, color: current.fg }}
            >
              <motion.span
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }}
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full sm:h-16 sm:w-16"
                style={{ background: current.accent, color: current.accentFg }}
                aria-hidden="true"
              >
                {current.icon}
              </motion.span>
              <div className="min-w-0">
                <motion.h2 {...rise(0.2)} className="text-lg font-extrabold leading-tight sm:text-3xl">
                  {current.title}
                </motion.h2>
                <motion.p {...rise(0.28)} className="mt-1 text-xs font-medium leading-snug sm:text-base">
                  {current.text}
                </motion.p>
                <motion.div {...rise(0.36)} className="mt-2.5">
                  <Action
                    slide={current}
                    className={`inline-flex items-center rounded-full px-4 py-2 text-xs font-bold transition-transform active:scale-95 sm:px-6 sm:py-2.5 sm:text-sm ${FOCUS}`}
                    style={{ background: current.ctaBg, color: current.ctaFg }}
                  >
                    {current.cta}
                  </Action>
                </motion.div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Bannière précédente"
            className={`absolute left-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#111111] transition-colors hover:text-[#FF6B00] sm:flex ${FOCUS}`}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Bannière suivante"
            className={`absolute right-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#111111] transition-colors hover:text-[#FF6B00] sm:flex ${FOCUS}`}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#111111]/70 px-2 py-1">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Afficher la bannière ${i + 1} sur ${n}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? 'w-6 bg-[#FF6B00]' : 'w-2 bg-white/60 hover:bg-white'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bannière principale : une bannière par lien                         */
/* ------------------------------------------------------------------ */

interface HeroProps {
  signedIn: boolean;
  sellerRoute: string;
  newShops: number;
  onSignup: () => void;
  onPost: () => void;
  onOrders: () => void;
  className?: string;
}

export default function HeroCarousel({ signedIn, sellerRoute, newShops, onSignup, onPost, onOrders, className }: HeroProps) {
  const slides: BannerSlide[] = [
    // 1. Image d'accueil
    {
      id: 'accueil',
      image: '/hero-banner.png',
      alt: "Des produits fiables, près de chez vous. Neuf ou d'occasion, trouvez ce qu'il vous faut au meilleur prix à Bukavu et partout en RDC. Explorer maintenant.",
      to: '/products',
      ms: IMAGE_MS,
    },
    // 2. Inscription ou publication
    signedIn
      ? {
          id: 'publier',
          icon: <Camera />,
          kicker: 'Vendez vite',
          title: 'Publiez votre annonce',
          text: 'Prenez vos photos, fixez votre prix et touchez des acheteurs près de chez vous.',
          cta: 'Publier une annonce',
          onClick: onPost,
          bg: '#111111',
          fg: '#FFFFFF',
          accent: '#FF6B00',
          accentFg: '#FFFFFF',
          ctaBg: '#FF6B00',
          ctaFg: '#FFFFFF',
        }
      : {
          id: 'inscription',
          icon: <UserPlus />,
          kicker: 'La marketplace de Bukavu et de toute la RDC',
          title: 'Rejoignez CBF SOKO',
          text: 'Achetez, vendez et faites-vous livrer en toute confiance, près de chez vous.',
          cta: 'Inscrivez-vous maintenant',
          onClick: onSignup,
          bg: '#111111',
          fg: '#FFFFFF',
          accent: '#FF6B00',
          accentFg: '#FFFFFF',
          ctaBg: '#FF6B00',
          ctaFg: '#FFFFFF',
        },
    // 3. Produits
    {
      id: 'produits',
      icon: <Search />,
      kicker: 'Neuf et occasion',
      title: 'Parcourir les produits',
      text: 'Trouvez ce qu’il vous faut au meilleur prix, à Bukavu et partout en RDC.',
      cta: 'Voir les produits',
      to: '/products',
      bg: '#FF6B00',
      fg: '#FFFFFF',
      accent: '#FFFFFF',
      accentFg: '#FF6B00',
      ctaBg: '#FFFFFF',
      ctaFg: '#111111',
    },
    // 4. Boutiques
    {
      id: 'boutiques',
      icon: <Store />,
      kicker: newShops > 0 ? `${newShops} nouvelle${newShops > 1 ? 's' : ''} boutique${newShops > 1 ? 's' : ''}` : 'Vendeurs de confiance',
      title: 'Boutiques partenaires',
      text: 'Découvrez les boutiques vérifiées et leurs dernières annonces.',
      cta: 'Voir les boutiques',
      to: '/boutique',
      bg: '#FFF1E7',
      fg: '#111111',
      accent: '#FF6B00',
      accentFg: '#FFFFFF',
      ctaBg: '#FF6B00',
      ctaFg: '#FFFFFF',
      badge: newShops,
      badgeLabel: newShops > 1 ? 'nouvelles boutiques' : 'nouvelle boutique',
    },
    // 5. Créer ma boutique
    {
      id: 'vendre',
      icon: <Megaphone />,
      kicker: 'Devenez vendeur',
      title: 'Vendez en toute simplicité',
      text: 'Créez votre boutique et atteignez plus de clients.',
      cta: 'Créer ma boutique',
      to: sellerRoute,
      bg: '#111111',
      fg: '#FFFFFF',
      accent: '#FF6B00',
      accentFg: '#FFFFFF',
      ctaBg: '#FF6B00',
      ctaFg: '#FFFFFF',
    },
    // 6. Commandes
    {
      id: 'commandes',
      icon: <Package />,
      kicker: 'Livraison',
      title: 'Suivre mes commandes',
      text: 'Suivez vos livraisons en cours, de la confirmation à la réception.',
      cta: 'Mes commandes',
      onClick: onOrders,
      bg: '#FF6B00',
      fg: '#FFFFFF',
      accent: '#FFFFFF',
      accentFg: '#FF6B00',
      ctaBg: '#FFFFFF',
      ctaFg: '#111111',
    },
  ];

  return (
    <Carousel
      slides={slides}
      label="Bannières CBF SOKO"
      variant="hero"
      className={className ?? 'h-52 rounded-2xl sm:h-72'}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Bannière du bas : avantages de CBF SOKO                             */
/* ------------------------------------------------------------------ */

interface AdvantagesProps {
  slides: BannerSlide[];
  className?: string;
}

export function AdvantagesCarousel({ slides, className }: AdvantagesProps) {
  return (
    <Carousel
      slides={slides}
      label="Avantages de CBF SOKO"
      variant="compact"
      className={className ?? 'h-44 rounded-2xl sm:h-52'}
    />
  );
}