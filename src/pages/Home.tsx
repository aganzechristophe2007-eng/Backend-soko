import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Camera, MessageSquare, Bell, Package,
  MapPin, User as UserIcon,
  Volume2, VolumeX, Store,
  X, Play, Sparkles,
  Eye, MessageCircle, Share2, Send,
  Home as HomeIcon, Plus, ArrowRight, Flame, Tag, BadgeCheck,
  LayoutGrid, Smartphone, Laptop, Shirt, Plug, Car, MoreHorizontal,
  Heart, Megaphone, ChevronRight
} from 'lucide-react';
import { apiFetch, BASE_URL } from '../api/client';
import AuthSheet from './Authsheet';
import { useAuth } from '../context/Authcontext';
import { applyTextPrefs, readSavedTextSize, readSavedTextFamily, TEXT_PREF_EVENT } from '../lib/textPrefs';

// Images du design : frontend/src/public/assets/home/
import logoCbfSoko from '../public/logo-cbf-soko.jpg';
import heroBanner from '../public/hero-banner.jpg';
import sellerBanner from '../public/seller-banner.jpg';
import livraisonImg from '../public/livraison.jpg';
import boutiqueImg from '../public/boutique.jpg';
import supportImg from '../public/support.jpg';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

interface User {
  id?: string;
  name: string;
  balance: number;
  role?: string;
  avatar?: string;
}

interface CategoryItem {
  id: string;
  name: string;
}

interface SellerLite {
  id: string;
  name: string;
  avatar?: string;
  verified?: boolean;
}

interface ProductItem {
  id: string;
  title: string;
  description?: string;
  priceUSD: number;
  priceCDF: number;
  category?: CategoryItem;
  images: string[];
  seller?: SellerLite;
  location?: string;
  state?: string;
  quantity?: number;
  type?: string;
  videoUrl?: string | null;
  createdAt?: string;
  _count?: { reelViews: number; reelComments: number };
}

interface ReelStats {
  views: number;
  comments: number;
}

interface ReelCommentItem {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user?: SellerLite;
}

interface ReelItem {
  id: string;
  videoUrl: string;
  thumbnail?: string;
  caption?: string;
  productId: string;
  seller?: SellerLite;
}

interface SearchInfo {
  query: string;
  terms: string[];
  categoryName: string;
  maxPriceUSD: number | null;
  minPriceUSD: number | null;
  location: string;
  state: string | null;
  ai: boolean;
  relaxed: boolean;
}

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  to?: string;
  onClick?: () => void;
  mobile: boolean;
}

// Thème clair CBF SOKO : fond blanc, orange #FF6B00 en couleur d'accent.
const DEFAULT_BACKGROUND = '#FFFFFF';

// Les anciens fonds (noir ou "Kivu Nature") éventuellement enregistrés sont ignorés au profit du blanc.
const readSavedBg = (): string => {
  const saved = localStorage.getItem('cbfsoko-custom-bg');
  if (!saved || saved === '#000000' || saved.includes('photo-1507525428034')) return DEFAULT_BACKGROUND;
  return saved;
};

// Informations légales affichées dans le pied de page. Seules les valeurs renseignées sont affichées :
// complétez-les avec les vraies informations de votre entreprise avant la mise en production.
const LEGAL_INFO = {
  companyName: 'CBFSOKO',
  rccm: '',
  idNat: '',
  nif: '',
  address: '',
  email: '',
  phone: '',
};

const LEGAL_ROWS: [string, string][] = ([
  ['Éditeur', LEGAL_INFO.companyName],
  ['RCCM', LEGAL_INFO.rccm],
  ['Id. Nat.', LEGAL_INFO.idNat],
  ['NIF', LEGAL_INFO.nif],
  ['Adresse', LEGAL_INFO.address],
] as [string, string][]).filter(([, value]) => !!value);

const LEGAL_LINKS = [
  { to: '/a-propos', label: 'À propos' },
  { to: '/legal/mentions-legales', label: 'Mentions légales' },
  { to: '/legal/cgu', label: "Conditions d'utilisation" },
  { to: '/legal/confidentialite', label: 'Politique de confidentialité' },
  { to: '/legal/cookies', label: 'Cookies et stockage local' },
];

// 184690000 -> "184 690 000"
const formatCDF = (value: number): string => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Route du bouton « Créer ma boutique » (bannière vendeur). À ajuster ici si votre page de création de boutique a une autre URL.
const SELLER_SHOP_ROUTE = '/boutique';

type MediaUrlFn = (mediaPath?: string | null) => string;

const normalizeText = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// 28 -> "0:28", 95 -> "1:35"
const formatDuration = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Icône Lucide choisie d'après le nom de la catégorie renvoyée par l'API (aucune catégorie n'est inventée).
const getCategoryIcon = (name: string): React.ReactNode => {
  const n = normalizeText(name);
  const cls = 'h-[22px] w-[22px] sm:h-7 sm:w-7';
  if (/phone|mobile/.test(n)) return <Smartphone className={cls} aria-hidden="true" />;
  if (/informatique|ordinateur|computer|laptop/.test(n)) return <Laptop className={cls} aria-hidden="true" />;
  if (/mode|vetement|habit|chaussure/.test(n)) return <Shirt className={cls} aria-hidden="true" />;
  if (/electro/.test(n)) return <Plug className={cls} aria-hidden="true" />;
  if (/maison|meuble|deco/.test(n)) return <HomeIcon className={cls} aria-hidden="true" />;
  if (/vehicule|voiture|auto|moto/.test(n)) return <Car className={cls} aria-hidden="true" />;
  return <Tag className={cls} aria-hidden="true" />;
};

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const SectionHeader = ({ title, subtitle, icon, action }: SectionHeaderProps) => (
  <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4 sm:gap-4">
    <div className="min-w-0">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-[#111111] sm:text-xl">
        {icon}
        <span className="truncate">{title}</span>
      </h2>
      {subtitle && <p className="mt-0.5 text-xs text-[#667085] sm:text-sm">{subtitle}</p>}
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

const SeeAllLink = () => (
  <Link
    to="/products"
    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1 text-xs font-semibold text-[#FF6B00] transition-colors hover:text-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] sm:text-sm"
  >
    Voir tout
    <ArrowRight className="h-4 w-4" aria-hidden="true" />
  </Link>
);

const SellerRow = ({ seller, getMediaUrl }: { seller?: SellerLite; getMediaUrl: MediaUrlFn }) => {
  const name = seller?.name || 'Vendeur';
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FFF1E7] text-[9px] font-bold text-[#FF6B00] sm:h-5 sm:w-5 sm:text-[10px]">
        {seller?.avatar ? (
          <img src={getMediaUrl(seller.avatar)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      <span className="truncate text-[10px] font-medium text-[#344054] sm:text-xs">{name}</span>
      {seller?.verified && (
        <BadgeCheck className="h-3 w-3 flex-shrink-0 text-[#2E90FA] sm:h-3.5 sm:w-3.5" role="img" aria-label="Vendeur vérifié" />
      )}
    </div>
  );
};

// Cœur « favori » en haut à droite des cartes. Persistance locale (navigateur) : à relier à votre API de favoris si elle existe.
const FavoriteButton = ({ active, onToggle, title }: { active: boolean; onToggle: () => void; title: string }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    aria-pressed={active}
    aria-label={active ? `Retirer des favoris : ${title}` : `Ajouter aux favoris : ${title}`}
    className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#344054] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] sm:right-2 sm:top-2 sm:h-8 sm:w-8"
  >
    <Heart className={`h-4 w-4 ${active ? 'fill-[#FF6B00] text-[#FF6B00]' : ''}`} aria-hidden="true" />
  </button>
);

const CARD_BASE =
  'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#EAECF0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]';

interface CardInfoProps {
  seller?: SellerLite;
  title: string;
  priceUSD?: number;
  priceCDF?: number;
  location?: string;
  getMediaUrl: MediaUrlFn;
}

const CardInfo = ({ seller, title, priceUSD, priceCDF, location, getMediaUrl }: CardInfoProps) => (
  <div className="flex min-w-0 flex-1 flex-col gap-1 p-2 sm:p-3">
    <SellerRow seller={seller} getMediaUrl={getMediaUrl} />
    <h3 className="line-clamp-1 text-[11px] font-semibold leading-snug text-[#111111] sm:text-sm">{title}</h3>
    {priceUSD !== undefined && (
      <div className="mt-auto">
        <p className="text-xs font-bold leading-tight text-[#FF6B00] sm:text-base">{priceUSD} $</p>
        {priceCDF !== undefined && priceCDF > 0 && (
          <p className="hidden text-xs text-[#667085] sm:block">≈ {formatCDF(priceCDF)} CDF</p>
        )}
      </div>
    )}
    {location && (
      <p className="flex items-center gap-1 text-[10px] text-[#667085] sm:text-xs">
        <MapPin className="h-3 w-3 flex-shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true" />
        <span className="truncate">{location}</span>
      </p>
    )}
  </div>
);

interface ReelCardProps {
  reel: ReelItem;
  product?: ProductItem;
  getMediaUrl: MediaUrlFn;
  muted: boolean;
  duration?: number;
  isFavorite: boolean;
  onOpen: () => void;
  onToggleMute: () => void;
  onToggleFavorite: () => void;
  onDuration: (seconds: number) => void;
  registerVideo: (el: HTMLVideoElement | null) => void;
}

const ReelCard = ({
  reel, product, getMediaUrl, muted, duration, isFavorite,
  onOpen, onToggleMute, onToggleFavorite, onDuration, registerVideo,
}: ReelCardProps) => {
  const title = product?.title || reel.caption || 'Vidéo produit';
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ouvrir la vidéo : ${title}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`${CARD_BASE} cursor-pointer`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#F2F4F7]">
        <video
          ref={registerVideo}
          src={reel.videoUrl}
          poster={reel.thumbnail}
          loop
          playsInline
          autoPlay
          aria-hidden="true"
          onLoadedMetadata={(e) => onDuration(e.currentTarget.duration)}
          className="h-full w-full object-cover"
        />

        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white backdrop-blur-sm sm:left-2 sm:top-2 sm:text-[11px]">
          <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
          {duration ? <span aria-label={`Durée ${formatDuration(duration)}`}>{formatDuration(duration)}</span> : null}
        </span>

        <FavoriteButton active={isFavorite} onToggle={onToggleFavorite} title={title} />

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          aria-label={muted ? 'Activer le son' : 'Couper le son'}
          className="absolute bottom-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      <CardInfo
        seller={reel.seller}
        title={title}
        priceUSD={product?.priceUSD}
        priceCDF={product?.priceCDF}
        location={product?.location}
        getMediaUrl={getMediaUrl}
      />
    </div>
  );
};

interface ProductCardProps {
  product: ProductItem;
  onOpen: (productId: string) => void;
  getMediaUrl: MediaUrlFn;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
}

const ProductCard = ({ product, onOpen, getMediaUrl, isFavorite, onToggleFavorite }: ProductCardProps) => {
  const isDemand = product.type?.toUpperCase() === 'DEMANDE' || /^\s*\[demande\]/i.test(product.title);
  return (
    <article
      onClick={() => onOpen(product.id)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(product.id);
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`${product.title}, ${product.priceUSD} $`}
      className={`${CARD_BASE} cursor-pointer`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#F2F4F7]">
        <img
          src={getMediaUrl(product.images?.[0])}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {isDemand && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-[#FF6B00] px-2 py-1 text-[10px] font-bold leading-none text-white sm:left-2 sm:top-2 sm:text-[11px]">DEMANDE</span>
        )}
        <FavoriteButton active={isFavorite} onToggle={() => onToggleFavorite(product.id)} title={product.title} />
      </div>

      <CardInfo
        seller={product.seller}
        title={product.title}
        priceUSD={product.priceUSD}
        priceCDF={product.priceCDF}
        location={product.location}
        getMediaUrl={getMediaUrl}
      />
    </article>
  );
};

interface CategoryPillProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count?: number;
  onClick: () => void;
}

const CATEGORY_SLOT = 'group flex w-[66px] flex-shrink-0 flex-col items-center gap-1.5 focus-visible:outline-none sm:w-24 lg:w-auto lg:min-w-0 lg:flex-1';

const CategoryPill = ({ label, icon, active, count, onClick }: CategoryPillProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={count ? `${label} (${count})` : label}
    className={CATEGORY_SLOT}
  >
    <span
      className={`flex h-12 w-12 items-center justify-center rounded-full transition sm:h-16 sm:w-16 group-focus-visible:ring-2 group-focus-visible:ring-[#FF6B00] group-focus-visible:ring-offset-2 ${
        active
          ? 'bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/25'
          : 'bg-[#FFF1E7] text-[#FF6B00] group-hover:bg-[#FFE4D1]'
      }`}
    >
      {icon}
    </span>
    <span
      className={`line-clamp-2 break-words text-center text-[10px] leading-tight tracking-tight sm:text-xs ${
        active ? 'font-bold text-[#FF6B00]' : 'font-medium text-[#111111]'
      }`}
    >
      {label}
    </span>
  </button>
);

interface NavTabProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  variant: 'top' | 'bottom';
  to?: string;
  onClick?: () => void;
}

const NavTab = ({ label, icon, active, variant, to, onClick }: NavTabProps) => {
  const state =
    variant === 'bottom'
      ? active
        ? 'text-[#FF6B00]'
        : 'text-[#667085] hover:text-[#111111]'
      : active
        ? 'bg-[#FFF1E7] text-[#FF6B00]'
        : 'text-[#667085] hover:bg-[#F2F4F7] hover:text-[#111111]';

  const layout =
    variant === 'top'
      ? 'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors'
      : 'flex w-full flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-medium transition-colors duration-150';

  const className = `${layout} ${state} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]`;

  const content = (
    <>
      <span className="relative flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className} aria-current={active ? 'page' : undefined} title={label}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} aria-current={active ? 'page' : undefined} title={label}>
      {content}
    </button>
  );
};

export default function Home() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const location = useLocation();
  const navigate = useNavigate();

  const { user, login: authLogin } = useAuth();
  const token = !!user;

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  // Recherche intelligente (IA) : résultats affichés directement sur l'accueil
  const [searchResults, setSearchResults] = useState<ProductItem[] | null>(null);
  const [searchInfo, setSearchInfo] = useState<SearchInfo | null>(null);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string>('');

  const [customBg, setCustomBg] = useState<string>(() => readSavedBg());

  const [reelMutedMap, setReelMutedMap] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [fullscreenReelIndex, setFullscreenReelIndex] = useState<number | null>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const [fullscreenMuted, setFullscreenMuted] = useState<boolean>(false);
  const [fullscreenPaused, setFullscreenPaused] = useState<boolean>(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState<boolean>(false);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const wheelLockRef = useRef<boolean>(false);

  const [showAuth, setShowAuth] = useState<boolean>(false);
  const [deliveryLoading, setDeliveryLoading] = useState<boolean>(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  // Vues / commentaires des reels (colonne d'icônes façon TikTok)
  const [reelStatsOverride, setReelStatsOverride] = useState<Record<string, ReelStats>>({});
  const [shareConfirm, setShareConfirm] = useState<boolean>(false);
  const shareConfirmTimerRef = useRef<number | null>(null);


  // Description complète du produit affiché en plein écran (non incluse dans la liste /api/products
  // pour garder celle-ci légère) : récupérée à la demande et mise en cache par produit.
  const [reelDescriptions, setReelDescriptions] = useState<Record<string, string>>({});

  // Panneau de commentaires
  const [showComments, setShowComments] = useState<boolean>(false);
  const [comments, setComments] = useState<ReelCommentItem[]>([]);
  const [commentsPage, setCommentsPage] = useState<number>(1);
  const [commentsHasMore, setCommentsHasMore] = useState<boolean>(false);
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [commentsError, setCommentsError] = useState<string>('');
  const [commentText, setCommentText] = useState<string>('');
  const [commentSubmitting, setCommentSubmitting] = useState<boolean>(false);

  const t = {
    page: 'antialiased [text-rendering:optimizeLegibility] text-[#111111] selection:bg-[#FF6B00] selection:text-white',
    header: 'border-b border-[#EAECF0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85',
    border: 'border-[#EAECF0] border',
    muted: 'text-[#667085]',
    mobileNav: 'border-t border-[#EAECF0] bg-white shadow-[0_-4px_16px_rgba(16,24,40,0.06)]',
  };

  const iconBtn = 'relative h-9 w-9 flex-shrink-0 sm:h-10 sm:w-10 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]';

  const getMediaUrl = useCallback((mediaPath?: string | null) => {
    if (!mediaPath) return 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80';
    if (mediaPath.startsWith('http') || mediaPath.startsWith('blob:') || mediaPath.startsWith('data:')) {
      return mediaPath;
    }
    const cleanPath = mediaPath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${API_ORIGIN}/${cleanPath}`;
  }, []);

  // Le fond d'écran est choisi depuis la page Paramètres ; ici on ne fait que
  // l'appliquer et rester synchronisé si l'utilisateur le change dans un autre onglet.
  useEffect(() => {
    const syncBg = () => {
      setCustomBg(readSavedBg());
    };
    window.addEventListener('storage-bg-change', syncBg);
    window.addEventListener('storage', syncBg);
    return () => {
      window.removeEventListener('storage-bg-change', syncBg);
      window.removeEventListener('storage', syncBg);
    };
  }, []);

  // Taille et police du texte : mêmes réglages que le fond d'écran, choisis depuis Paramètres.
  useEffect(() => {
    applyTextPrefs(readSavedTextSize(), readSavedTextFamily());
    const syncTextPrefs = () => applyTextPrefs(readSavedTextSize(), readSavedTextFamily());
    window.addEventListener(TEXT_PREF_EVENT, syncTextPrefs);
    window.addEventListener('storage', syncTextPrefs);
    return () => {
      window.removeEventListener(TEXT_PREF_EVENT, syncTextPrefs);
      window.removeEventListener('storage', syncTextPrefs);
    };
  }, []);

  useEffect(() => {
    apiFetch('/products')
      .then((data) => {
        const list: ProductItem[] = Array.isArray(data) ? data : data.data || [];
        setProducts(list);
      })
      .catch((err) => console.error('Erreur chargement produits', err))
      .finally(() => setLoadingProducts(false));

    apiFetch('/categories')
      .then((data) => setCategories(data.categories || []))
      .catch((err) => console.error('Erreur chargement catégories', err));
  }, []);

  const displayedReels = useMemo<ReelItem[]>(
    () =>
      products
        .filter((p) => !!p.videoUrl)
        .slice(0, 12)
        .map((p) => ({
          id: p.id,
          videoUrl: getMediaUrl(p.videoUrl),
          thumbnail: getMediaUrl(p.images?.[0]),
          caption: p.title,
          productId: p.id,
          seller: p.seller,
        })),
    [products, getMediaUrl]
  );

  const isReelMuted = useCallback((id: string) => reelMutedMap[id] ?? true, [reelMutedMap]);
  const toggleReelMute = useCallback((id: string) => {
    setReelMutedMap((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  const openFullscreenReelById = useCallback((reelId: string) => {
    const idx = displayedReels.findIndex((r) => r.id === reelId);
    if (idx !== -1) {
      setFullscreenMuted(false);
      setFullscreenPaused(false);
      setFullscreenReelIndex(idx);
    }
  }, [displayedReels]);

  const closeFullscreenReel = useCallback(() => setFullscreenReelIndex(null), []);

  // Le panneau de commentaires ne doit pas rester ouvert en passant au reel suivant/précédent.
  useEffect(() => {
    setShowComments(false);
    setDescriptionExpanded(false);
  }, [fullscreenReelIndex]);

  const currentFullscreenReel = useMemo(() => {
    if (fullscreenReelIndex === null || !displayedReels[fullscreenReelIndex]) return null;
    return displayedReels[fullscreenReelIndex];
  }, [fullscreenReelIndex, displayedReels]);

  const fullscreenProduct = useMemo(
    () => (currentFullscreenReel ? products.find((p) => p.id === currentFullscreenReel.productId) ?? null : null),
    [currentFullscreenReel, products]
  );

  useEffect(() => {
    const video = fullscreenVideoRef.current;
    if (fullscreenReelIndex === null || !video) return;
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      setFullscreenMuted(true);
      video.play().catch(() => undefined);
    });
  }, [fullscreenReelIndex]);

  // Identifiant anonyme stable (utilisé pour compter une vue par visiteur, même sans compte).
  const getVisitorId = useCallback((): string => {
    const key = 'cbfsoko-visitor-id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }, []);

  // Format court façon réseaux sociaux : 1 2 3 -> "1,2 k", 15 000 -> "15 k".
  const formatCount = useCallback((value: number): string => {
    if (!value || value < 1000) return String(value || 0);
    const suffix = value < 1_000_000 ? 'k' : 'M';
    const base = value < 1_000_000 ? value / 1000 : value / 1_000_000;
    const formatted = base.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${formatted} ${suffix}`;
  }, []);

  const baseReelStats = useMemo(() => {
    const map: Record<string, ReelStats> = {};
    products.forEach((p) => {
      map[p.id] = {
        views: p._count?.reelViews ?? 0,
        comments: p._count?.reelComments ?? 0,
      };
    });
    return map;
  }, [products]);

  const getReelStats = useCallback(
    (reelId: string): ReelStats => {
      const base = baseReelStats[reelId] ?? { views: 0, comments: 0 };
      const override = reelStatsOverride[reelId];
      return override ? { ...base, ...override } : base;
    },
    [baseReelStats, reelStatsOverride]
  );

  const currentReelStats = useMemo(
    () => (currentFullscreenReel ? getReelStats(currentFullscreenReel.id) : { views: 0, comments: 0 }),
    [currentFullscreenReel, getReelStats]
  );

  const currentReelDescription = useMemo(() => {
    if (!currentFullscreenReel) return '';
    return reelDescriptions[currentFullscreenReel.productId] ?? fullscreenProduct?.description ?? '';
  }, [currentFullscreenReel, reelDescriptions, fullscreenProduct]);

  const registerReelView = useCallback(async (reelId: string) => {
    try {
      const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}/reels/${reelId}/view`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: getVisitorId() }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setReelStatsOverride((prev) => ({
          ...prev,
          [reelId]: { ...getReelStats(reelId), views: result.viewsCount },
        }));
      }
    } catch (err) {
      console.error('Erreur enregistrement vue reel', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getVisitorId]);

  // Une vue est comptée quand le reel reste affiché en plein écran ~2 secondes, une fois par ouverture.
  useEffect(() => {
    if (!currentFullscreenReel) return;
    const reelId = currentFullscreenReel.id;
    const timer = window.setTimeout(() => registerReelView(reelId), 2000);
    return () => window.clearTimeout(timer);
  }, [currentFullscreenReel, registerReelView]);

  // Récupère la description complète du produit affiché (absente de la liste allégée /api/products).
  useEffect(() => {
    if (!currentFullscreenReel) return;
    const productId = currentFullscreenReel.productId;
    if (reelDescriptions[productId] !== undefined) return;
    let cancelled = false;
    fetch(`${BASE_URL.replace(/\/+$/, '')}/products/${productId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((result) => {
        if (cancelled || !result?.success || !result.data) return;
        setReelDescriptions((prev) => ({ ...prev, [productId]: result.data.description || '' }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentFullscreenReel, reelDescriptions]);

  const loadComments = useCallback(async (reelId: string, page: number, replace: boolean) => {
    setCommentsLoading(true);
    setCommentsError('');
    try {
      const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}/reels/${reelId}/comments?page=${page}`, {
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de charger les commentaires.');
      setComments((prev) => (replace ? result.data : [...prev, ...result.data]));
      setCommentsHasMore(!!result.hasMore);
      setCommentsPage(page);
    } catch (err: any) {
      setCommentsError(err.message || 'Impossible de charger les commentaires.');
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const openComments = useCallback(() => {
    if (!currentFullscreenReel) return;
    setShowComments(true);
    setComments([]);
    setCommentsHasMore(false);
    setCommentsError('');
    loadComments(currentFullscreenReel.id, 1, true);
  }, [currentFullscreenReel, loadComments]);

  const closeComments = useCallback(() => setShowComments(false), []);

  const loadMoreComments = useCallback(() => {
    if (!currentFullscreenReel || commentsLoading || !commentsHasMore) return;
    loadComments(currentFullscreenReel.id, commentsPage + 1, false);
  }, [currentFullscreenReel, commentsLoading, commentsHasMore, commentsPage, loadComments]);

  const submitComment = useCallback(async () => {
    if (!currentFullscreenReel) return;
    if (!token) {
      openAuth();
      return;
    }
    const content = commentText.trim();
    if (content.length < 1 || content.length > 300 || commentSubmitting) return;

    setCommentSubmitting(true);
    setCommentsError('');
    try {
      const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}/reels/${currentFullscreenReel.id}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Impossible d'envoyer le commentaire.");
      setComments((prev) => [result.comment, ...prev]);
      setCommentText('');
      setReelStatsOverride((prev) => ({
        ...prev,
        [currentFullscreenReel.id]: { views: getReelStats(currentFullscreenReel.id).views, comments: result.commentsCount },
      }));
    } catch (err: any) {
      setCommentsError(err.message || "Impossible d'envoyer le commentaire.");
    } finally {
      setCommentSubmitting(false);
    }
  }, [currentFullscreenReel, token, commentText, commentSubmitting, getReelStats]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!currentFullscreenReel) return;
    try {
      const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}/reels/${currentFullscreenReel.id}/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Suppression impossible.');
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setReelStatsOverride((prev) => ({
        ...prev,
        [currentFullscreenReel.id]: { views: getReelStats(currentFullscreenReel.id).views, comments: result.commentsCount },
      }));
    } catch (err) {
      console.error('Erreur suppression commentaire', err);
    }
  }, [currentFullscreenReel, getReelStats]);

  const shareReel = useCallback(async () => {
    if (!currentFullscreenReel) return;
    const url = `${window.location.origin}/products/${currentFullscreenReel.productId}`;
    const title = fullscreenProduct?.title || currentFullscreenReel.caption || 'CBFSOKO';

    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
      } catch {
        /* Partage annulé par l'utilisateur : rien à faire. */
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareConfirm(true);
      if (shareConfirmTimerRef.current) window.clearTimeout(shareConfirmTimerRef.current);
      shareConfirmTimerRef.current = window.setTimeout(() => setShareConfirm(false), 2000);
    } catch {
      /* Presse-papiers indisponible : rien d'autre à proposer ici. */
    }
  }, [currentFullscreenReel, fullscreenProduct]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || fullscreenReelIndex === null) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const threshold = 50;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > threshold) {
        if (currentFullscreenReel) {
          closeFullscreenReel();
          navigate(`/products/${currentFullscreenReel.productId}`);
        }
      } else if (deltaX < -threshold) {
        if (currentFullscreenReel) {
          closeFullscreenReel();
          handleDeliveryRequest(currentFullscreenReel.productId);
        }
      }
    } else {
      if (deltaY > threshold) {
        if (fullscreenReelIndex > 0) setFullscreenReelIndex(fullscreenReelIndex - 1);
      } else if (deltaY < -threshold) {
        if (fullscreenReelIndex < displayedReels.length - 1) setFullscreenReelIndex(fullscreenReelIndex + 1);
      }
    }
    touchStartRef.current = null;
  };

  // Molette / trackpad : même logique que le swipe tactile, pour naviguer entre reels au scroll
  // (souris sur desktop). Verrouillage court pour n'avancer que d'un reel par geste.
  const handleWheel = (e: React.WheelEvent) => {
    if (fullscreenReelIndex === null || wheelLockRef.current) return;
    if (Math.abs(e.deltaY) < 12) return;

    wheelLockRef.current = true;
    if (e.deltaY > 0) {
      if (fullscreenReelIndex < displayedReels.length - 1) setFullscreenReelIndex(fullscreenReelIndex + 1);
    } else {
      if (fullscreenReelIndex > 0) setFullscreenReelIndex(fullscreenReelIndex - 1);
    }
    window.setTimeout(() => { wheelLockRef.current = false; }, 500);
  };

  const toggleFullscreenPlay = () => {
    const video = fullscreenVideoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  const toggleFullscreenMute = () => {
    const video = fullscreenVideoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setFullscreenMuted(video.muted);
  };

  const openAuth = (redirect?: string) => {
    setPendingRedirect(redirect ?? null);
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
    if (!token) openAuth(destination);
    else navigate(destination);
  };

  // "Me faire livrer" : crée la demande de livraison côté serveur (chrono 24h + message
  // automatique au vendeur), puis envoie l'acheteur sur l'onglet Commande.
  const handleDeliveryRequest = useCallback(
    async (productId: string) => {
      if (!token) { openAuth('/orders'); return; }
      if (deliveryLoading) return;
      setDeliveryLoading(true);
      try {
        const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/orders/delivery-request`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId }),
        });
        if (!res.ok) throw new Error('Échec de la demande de livraison');
      } catch (err) {
        console.error('Erreur demande de livraison', err);
      } finally {
        setDeliveryLoading(false);
        navigate('/orders');
      }
    },
    [token, deliveryLoading, navigate]
  );

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchInfo(null);
    setSearchError('');
  };

  // Recherche intelligente : comprend le français, le swahili, les fautes et les phrases.
  // Si l'IA est indisponible, le serveur renvoie quand même des résultats (recherche simple).
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      clearSearch();
      return;
    }
    if (searchLoading) return;

    setSearchLoading(true);
    setSearchError('');
    try {
      const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}/products/smart-search`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Recherche indisponible. Réessayez.');
      }
      setSearchResults(Array.isArray(result.data) ? result.data : []);
      setSearchInfo({ query, ...result.interpretation });
      setActiveCategoryId(null);
    } catch (err: any) {
      setSearchError(err.message || 'Recherche indisponible. Réessayez.');
    } finally {
      setSearchLoading(false);
    }
  };

  const searchChips = useMemo(() => {
    if (!searchInfo) return [] as string[];
    const chips: string[] = [];
    if (searchInfo.categoryName) chips.push(`Catégorie : ${searchInfo.categoryName}`);
    if (searchInfo.minPriceUSD != null) chips.push(`Dès ${searchInfo.minPriceUSD} $`);
    if (searchInfo.maxPriceUSD != null) chips.push(`Jusqu'à ${searchInfo.maxPriceUSD} $`);
    if (searchInfo.location) chips.push(`Lieu : ${searchInfo.location}`);
    if (searchInfo.state) chips.push(`État : ${searchInfo.state.replace(/_/g, ' ').toLowerCase()}`);
    if (searchInfo.ai && searchInfo.terms.length > 0) chips.push(`Mots liés : ${searchInfo.terms.slice(0, 5).join(', ')}`);
    return chips;
  }, [searchInfo]);

  const goToProductDetails = useCallback((productId: string) => navigate(`/products/${productId}`), [navigate]);

  const displayedProducts = useMemo(() => {
    let list = searchResults ?? products;
    if (activeCategoryId) {
      list = list.filter((product) => product.category?.id === activeCategoryId);
    }
    return list;
  }, [products, searchResults, activeCategoryId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      const id = p.category?.id;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    });
    return counts;
  }, [products]);

  // Durée des vidéos (lue dans les métadonnées de chaque vidéo, aucune donnée ajoutée côté API).
  const [reelDurations, setReelDurations] = useState<Record<string, number>>({});
  const handleReelDuration = useCallback((reelId: string, seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    setReelDurations((prev) => (prev[reelId] === seconds ? prev : { ...prev, [reelId]: seconds }));
  }, []);

  // Favoris (cœur des cartes) : mémorisés dans ce navigateur.
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('cbfsoko-favorites') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const toggleFavorite = useCallback((productId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId];
      try { localStorage.setItem('cbfsoko-favorites', JSON.stringify(next)); } catch { /* stockage indisponible */ }
      return next;
    });
  }, []);

  // Reels de « À la une » associés à leur produit (prix, localisation) : mêmes données, aucune donnée ajoutée.
  const featuredItems = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p] as const));
    return displayedReels.map((reel) => ({ reel, product: byId.get(reel.productId) }));
  }, [products, displayedReels]);

  // Quand une recherche aboutit, on amène l'utilisateur sur la liste des résultats.
  const annoncesRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (searchResults !== null) annoncesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchResults]);

  const path = location.pathname;
  const navItems: NavItem[] = [
    { key: 'home', label: 'Accueil', icon: <HomeIcon className="h-6 w-6" />, active: path === '/', to: '/', mobile: true },
    { key: 'orders', label: 'Commandes', icon: <Package className="h-6 w-6" />, active: path.startsWith('/orders'), onClick: () => handleProtectedAction('/orders'), mobile: false },
    { key: 'shop', label: 'Boutiques', icon: <Store className="h-6 w-6" />, active: path.startsWith('/boutique'), to: '/boutique', mobile: true },
    { key: 'messages', label: 'Messages', icon: <MessageSquare className="h-6 w-6" />, active: path.startsWith('/messages'), onClick: () => handleProtectedAction('/messages'), mobile: true },
    {
      key: 'profile',
      label: 'Profil',
      icon: token && user?.avatar ? (
        <span className="h-6 w-6 overflow-hidden rounded-full bg-[#F2F4F7]">
          <img src={getMediaUrl(user.avatar)} alt="" className="h-full w-full object-cover" />
        </span>
      ) : (
        <UserIcon className="h-6 w-6" />
      ),
      active: path.startsWith('/profile'),
      onClick: () => handleProtectedAction('/profile'),
      mobile: true,
    },
  ];

  const renderTab = (item: NavItem, variant: 'top' | 'bottom') => (
    <NavTab key={item.key} label={item.label} icon={item.icon} active={item.active} to={item.to} onClick={item.onClick} variant={variant} />
  );

  const mobileItems = navItems.filter((item) => item.mobile);
  const mobileMid = 2;

  // « Autres » (3 points) mène à la liste complète ; si l'API a déjà une catégorie « Autres », on l'appelle « Tout voir ».
  const hasOthersCategory = categories.some((c) => /^autres?$/.test(normalizeText(c.name).trim()));

  return (
    <div
      className={`relative flex min-h-screen flex-col overflow-x-clip ${t.page}`}
      style={{
        background: customBg,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* HEADER */}
      <header className={`sticky top-0 z-50 ${t.header}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-2.5 lg:px-8">
          <Link
            to="/"
            className="flex-shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
            aria-label="CBF SOKO, accueil"
          >
            <img src={logoCbfSoko} alt="CBF SOKO" className="h-10 w-auto sm:h-12" />
          </Link>

          <form onSubmit={handleSearch} role="search" className="min-w-0 flex-1 lg:mx-auto lg:max-w-2xl">
            <div className="flex h-10 w-full min-w-0 items-center gap-1 rounded-full border border-[#EAECF0] bg-white pl-1 pr-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition focus-within:border-[#FF6B00] focus-within:ring-2 focus-within:ring-[#FF6B00]/20 sm:h-11 sm:pr-4">
              <button
                type="submit"
                disabled={searchLoading}
                aria-label="Rechercher"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#111111] transition-colors hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] disabled:opacity-60"
              >
                {searchLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#FF6B00] border-t-transparent" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
              </button>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un produit, une boutique…"
                aria-label="Rechercher un produit"
                maxLength={200}
                className="min-w-0 flex-1 bg-transparent text-base font-medium text-[#111111] placeholder-[#98A2B3] outline-none sm:text-sm"
              />
            </div>
          </form>

          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => handleProtectedAction('/orders')}
              className={`${iconBtn} hidden sm:inline-flex md:hidden`}
              aria-label="Commandes"
              title="Commandes"
            >
              <Package className="h-[18px] w-[18px]" />
            </button>

            <button
              type="button"
              onClick={() => handleProtectedAction('/notifications')}
              className={`${iconBtn} ${token ? 'inline-flex' : 'hidden sm:inline-flex'}`}
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>

            <Link
              to="/settings"
              className={`${token ? 'inline-flex' : 'hidden sm:inline-flex'} flex-shrink-0 items-center gap-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]`}
              title="Paramètres"
              aria-label="Paramètres"
            >
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[#EAECF0] bg-[#F2F4F7] text-[#111111] sm:h-10 sm:w-10">
                {token && user?.avatar ? (
                  <img src={getMediaUrl(user.avatar)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-[18px] w-[18px]" />
                )}
              </span>
              <ChevronRight className="h-4 w-4 text-[#667085]" aria-hidden="true" />
            </Link>

            {!token && (
              <button
                type="button"
                onClick={() => openAuth()}
                className="inline-flex h-9 flex-shrink-0 items-center rounded-full bg-[#FF6B00] px-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 sm:px-4"
              >
                Connexion
              </button>
            )}
          </div>
        </div>

        {/* NAVIGATION ORDINATEUR : mêmes options que la barre du bas sur mobile, plus Commandes */}
        <div className="hidden border-t border-[#EAECF0] md:block">
          <nav aria-label="Navigation principale" className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-1.5 sm:px-6 lg:px-8 [&_svg]:h-5 [&_svg]:w-5">
            {navItems.map((item) => renderTab(item, 'top'))}
            <button
              type="button"
              onClick={() => handleProtectedAction('/create-product')}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#FF6B00] px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
            >
              <Camera className="h-5 w-5" />
              Poster
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 pb-4">
        {/* HERO (+ bannière vendeur à droite sur ordinateur). Le texte et les boutons font partie des images. */}
        <section aria-label="Bienvenue" className="mx-auto max-w-7xl px-3 pt-3 sm:px-6 sm:pt-4 lg:px-8 lg:pt-6">
          <h1 className="sr-only">CBF SOKO : des produits fiables, près de chez vous</h1>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
            <Link
              to="/products"
              aria-label="Explorer maintenant"
              className="block overflow-hidden rounded-2xl border border-[#EAECF0] shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(16,24,40,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 sm:rounded-3xl"
            >
              <img
                src={heroBanner}
                alt="Des produits fiables, près de chez vous. Neuf ou d'occasion, trouvez ce qu'il vous faut au meilleur prix à Bukavu et partout en RDC. Explorer maintenant."
                decoding="async"
                className="block h-auto w-full"
              />
            </Link>

            <Link
              to={SELLER_SHOP_ROUTE}
              aria-label="Créer ma boutique"
              className="relative hidden overflow-hidden rounded-3xl border border-[#EAECF0] shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(16,24,40,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 lg:block"
            >
              <img
                src={sellerBanner}
                alt="Devenez vendeur sur CBF SOKO ! Vendez vos produits en toute simplicité et atteignez plus de clients. Créer ma boutique."
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </Link>
          </div>
        </section>

        {/* À LA UNE (reels) : défilement horizontal sur mobile, 6 puis 8 vignettes alignées sur ordinateur */}
        <section aria-label="À la une" className="mx-auto max-w-7xl px-3 pt-5 sm:px-6 sm:pt-8 lg:px-8">
          <SectionHeader
            icon={<Flame className="h-5 w-5 text-[#FF6B00]" aria-hidden="true" />}
            title="À la une"
            subtitle="Les produits qui attirent l'attention"
            action={<SeeAllLink />}
          />

          {loadingProducts ? (
            <div className="-mx-3 flex gap-2.5 overflow-hidden px-3 sm:mx-0 sm:gap-4 sm:px-0 lg:grid lg:grid-cols-6 xl:grid-cols-8">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-[190px] w-[112px] flex-shrink-0 animate-pulse rounded-2xl bg-[#F2F4F7] sm:h-[260px] sm:w-[150px] lg:h-[250px] lg:w-auto" />
              ))}
            </div>
          ) : featuredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#EAECF0] py-8 text-center text-sm text-[#667085]">Aucune vidéo.</div>
          ) : (
            <div className="scrollbar-hide -mx-3 flex snap-x snap-mandatory scroll-px-3 gap-2.5 overflow-x-auto px-3 pb-3 pt-1 sm:mx-0 sm:scroll-px-0 sm:gap-4 sm:px-0 lg:grid lg:grid-cols-6 lg:overflow-visible xl:grid-cols-8">
              {featuredItems.map(({ reel, product }, index) => (
                <div
                  key={reel.id}
                  className={`w-[112px] flex-shrink-0 snap-start sm:w-[150px] md:w-[168px] lg:w-auto ${
                    index >= 8 ? 'lg:hidden' : index >= 6 ? 'lg:hidden xl:block' : ''
                  }`}
                >
                  <ReelCard
                    reel={reel}
                    product={product}
                    getMediaUrl={getMediaUrl}
                    muted={isReelMuted(reel.id)}
                    duration={reelDurations[reel.id]}
                    isFavorite={favoriteIds.includes(reel.productId)}
                    onOpen={() => openFullscreenReelById(reel.id)}
                    onToggleMute={() => toggleReelMute(reel.id)}
                    onToggleFavorite={() => toggleFavorite(reel.productId)}
                    onDuration={(seconds) => handleReelDuration(reel.id, seconds)}
                    registerVideo={(el) => { videoRefs.current[reel.id] = el; if (el) el.muted = isReelMuted(reel.id); }}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CATÉGORIES (+ illustrations livraison / boutique / support sur ordinateur) */}
        <section
          aria-label="Catégories"
          className={`mx-auto grid max-w-7xl gap-4 px-3 pt-4 sm:px-6 sm:pt-6 lg:px-8 ${
            categories.length > 0 ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''
          }`}
        >
          {categories.length > 0 && (
            <div className="min-w-0 lg:rounded-2xl lg:border lg:border-[#EAECF0] lg:bg-white lg:p-4 lg:shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
              <div className="scrollbar-hide -mx-3 flex gap-0.5 overflow-x-auto px-3 pb-1 pt-1 sm:mx-0 sm:gap-3 sm:px-0 lg:gap-1 lg:overflow-visible lg:pb-0 lg:pt-0">
                <CategoryPill
                  label="Tous"
                  icon={<LayoutGrid className="h-[22px] w-[22px] sm:h-7 sm:w-7" aria-hidden="true" />}
                  active={activeCategoryId === null}
                  onClick={() => setActiveCategoryId(null)}
                />
                {categories.map((cat) => (
                  <CategoryPill
                    key={cat.id}
                    label={cat.name}
                    icon={getCategoryIcon(cat.name)}
                    active={activeCategoryId === cat.id}
                    count={categoryCounts[cat.id] ?? 0}
                    onClick={() => setActiveCategoryId(cat.id)}
                  />
                ))}
                <Link
                  to="/products"
                  aria-label="Voir toutes les annonces"
                  title="Voir toutes les annonces"
                  className={CATEGORY_SLOT}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00] transition group-hover:bg-[#FFE4D1] group-focus-visible:ring-2 group-focus-visible:ring-[#FF6B00] group-focus-visible:ring-offset-2 sm:h-16 sm:w-16">
                    <MoreHorizontal className="h-[22px] w-[22px] sm:h-7 sm:w-7" aria-hidden="true" />
                  </span>
                  <span className="text-center text-[10px] font-medium leading-tight tracking-tight text-[#111111] sm:text-xs">
                    {hasOthersCategory ? 'Tout voir' : 'Autres'}
                  </span>
                </Link>
              </div>
            </div>
          )}

          <div className="hidden min-w-0 rounded-2xl border border-[#EAECF0] bg-white p-3 shadow-[0_1px_3px_rgba(16,24,40,0.06)] lg:block">
            <div className="grid grid-cols-3 gap-3">
              <img
                src={livraisonImg}
                alt="Livreur CBF SOKO à scooter avec un colis"
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              <img
                src={boutiqueImg}
                alt="Boutique CBF SOKO avec son auvent orange"
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              <img
                src={supportImg}
                alt="Conseillère du support client CBF SOKO avec un casque-micro"
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
            </div>
          </div>
        </section>

        {/* BANNIÈRE VENDEUR (mobile / tablette ; sur ordinateur la bannière vendeur est à côté du hero) */}
        <section aria-label="Devenir vendeur" className="mx-auto max-w-7xl px-3 pb-6 pt-4 sm:px-6 lg:hidden">
          <div className="flex items-stretch overflow-hidden rounded-2xl border border-[#FFE0CC] bg-[#FFF1E7]">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 p-3 sm:gap-4 sm:p-5">
              <Megaphone className="h-8 w-8 flex-shrink-0 text-[#FF6B00] sm:h-12 sm:w-12" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold leading-tight text-[#111111] sm:text-2xl">
                  <span className="text-[#FF6B00]">Vendez vos produits</span>
                  <br />
                  en toute simplicité !
                </h2>
                <p className="mt-1 text-[11px] leading-snug text-[#667085] sm:text-sm">
                  Créez votre boutique et touchez plus de clients.
                </p>
                <Link
                  to={SELLER_SHOP_ROUTE}
                  className="mt-2.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#FF6B00] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 sm:px-5 sm:py-2.5 sm:text-sm"
                >
                  Créer ma boutique
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="relative w-[30%] flex-shrink-0 sm:w-[36%]">
              <img
                src={sellerBanner}
                alt="Vendeur CBF SOKO souriant, prêt à vendre ses produits en ligne"
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover object-right"
              />
            </div>
          </div>
        </section>

        {/* DERNIÈRES ANNONCES / RÉSULTATS DE RECHERCHE */}
        <section ref={annoncesRef} aria-label="Annonces" className="mx-auto max-w-7xl scroll-mt-32 px-3 pb-8 pt-2 sm:px-6 lg:px-8 lg:pt-6">
          <SectionHeader
            icon={<Tag className="h-5 w-5 text-[#FF6B00]" aria-hidden="true" />}
            title={searchResults !== null ? 'Résultats de la recherche' : 'Nos dernières annonces'}
            action={
              searchResults !== null ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="flex items-center gap-1 rounded-full border border-[#EAECF0] bg-white px-3 py-1.5 text-sm font-semibold text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Effacer
                </button>
              ) : (
                <SeeAllLink />
              )
            }
          />

          {searchError && (
            <div role="alert" className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{searchError}</div>
          )}

          {searchInfo && searchResults !== null && (
            <div className="mb-4 rounded-2xl border border-[#FFE0CC] bg-[#FFF1E7] p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[#111111]">
                <Sparkles className="h-4 w-4 flex-shrink-0 text-[#FF6B00]" aria-hidden="true" />
                <span className="min-w-0 break-words">{searchInfo.ai ? 'Recherche intelligente' : 'Recherche'} : « {searchInfo.query} »</span>
              </p>
              {searchChips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {searchChips.map((chip) => (
                    <span key={chip} className="rounded-full border border-[#FFE0CC] bg-white px-2.5 py-1 text-xs font-medium text-[#111111]">
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              {searchInfo.relaxed && (
                <p className="mt-2 text-xs font-medium text-[#667085]">Aucun résultat exact : les critères ont été élargis.</p>
              )}
            </div>
          )}

          {loadingProducts || searchLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="animate-pulse overflow-hidden rounded-2xl border border-[#EAECF0] bg-white">
                  <div className="aspect-[4/5] w-full bg-[#F2F4F7]" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-1/2 rounded bg-[#F2F4F7]" />
                    <div className="h-3 w-3/4 rounded bg-[#F2F4F7]" />
                    <div className="h-4 w-1/3 rounded bg-[#F2F4F7]" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className={`rounded-2xl border border-dashed py-10 text-center text-sm font-medium ${t.border} ${t.muted}`}>
              {searchResults !== null ? 'Aucun résultat pour cette recherche.' : 'Aucune annonce.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
              {displayedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={goToProductDetails}
                  getMediaUrl={getMediaUrl}
                  isFavorite={favoriteIds.includes(product.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* PIED DE PAGE LÉGAL */}
      <footer className="border-t border-[#EAECF0] bg-[#F9FAFB] pb-28 pt-10 md:pb-8">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <img src={logoCbfSoko} alt="CBF SOKO" loading="lazy" className="h-12 w-auto" />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#667085]">
              CBFSOKO met en relation acheteurs et vendeurs. Chaque annonce est publiée sous la seule responsabilité de son auteur.
            </p>
          </div>

          <nav aria-label="Informations légales">
            <h2 className="text-sm font-bold text-[#111111]">Informations légales</h2>
            <ul className="mt-3 space-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-[#667085] transition-colors hover:text-[#FF6B00] focus-visible:outline-none focus-visible:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-bold text-[#111111]">Éditeur du site</h2>
            <dl className="mt-3 space-y-1.5 text-sm text-[#667085]">
              {LEGAL_ROWS.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="font-medium text-[#111111]">{label} :</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
              {LEGAL_INFO.email && (
                <div className="flex gap-2">
                  <dt className="font-medium text-[#111111]">Email :</dt>
                  <dd className="min-w-0 break-words">
                    <a href={`mailto:${LEGAL_INFO.email}`} className="hover:text-[#FF6B00]">{LEGAL_INFO.email}</a>
                  </dd>
                </div>
              )}
              {LEGAL_INFO.phone && (
                <div className="flex gap-2">
                  <dt className="font-medium text-[#111111]">Téléphone :</dt>
                  <dd>
                    <a href={`tel:${LEGAL_INFO.phone.replace(/\s/g, '')}`} className="hover:text-[#FF6B00]">{LEGAL_INFO.phone}</a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-7xl border-t border-[#EAECF0] px-4 pt-4 sm:px-6 lg:px-8">
          <p className="text-xs text-[#667085]">
            Les prix en francs congolais (CDF) sont des conversions indicatives des prix en dollars américains (USD).
          </p>
          <p className="mt-1 text-xs text-[#667085]">
            © {new Date().getFullYear()} {LEGAL_INFO.companyName}. Tous droits réservés.
          </p>
        </div>
      </footer>

      {/* BARRE DU BAS (mobile) */}
      <nav
        aria-label="Navigation mobile"
        className={`fixed inset-x-0 bottom-0 z-50 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden ${t.mobileNav}`}
      >
        <div className="grid grid-cols-5 items-end gap-0">
          {mobileItems.slice(0, mobileMid).map((item) => renderTab(item, 'bottom'))}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => handleProtectedAction('/create-product')}
              aria-label="Publier une annonce"
              className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF6B00] text-white shadow-lg shadow-[#FF6B00]/30 ring-4 ring-white transition hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-[#FFD2B0] active:scale-95"
            >
              <Plus className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
            </button>
            <span className="mt-1 text-[11px] font-semibold text-[#FF6B00]">Publier</span>
          </div>
          {mobileItems.slice(mobileMid).map((item) => renderTab(item, 'bottom'))}
        </div>
      </nav>

      {/* REEL PLEIN ÉCRAN */}
      <AnimatePresence>
        {currentFullscreenReel && (
          <div
            className="fixed inset-0 z-[60] bg-black overflow-hidden select-none"
            role="dialog"
            aria-modal="true"
            aria-label={currentFullscreenReel.caption || 'Vidéo'}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            <video
              ref={fullscreenVideoRef}
              src={currentFullscreenReel.videoUrl}
              poster={currentFullscreenReel.thumbnail}
              className="h-full w-full object-cover cursor-pointer"
              autoPlay
              loop
              playsInline
              onClick={toggleFullscreenPlay}
              onPlay={() => setFullscreenPaused(false)}
              onPause={() => setFullscreenPaused(true)}
            />

            <div className="absolute inset-x-3 top-3 z-20 flex items-center justify-end" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={toggleFullscreenMute} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white border border-white/30">
                  {fullscreenMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={closeFullscreenReel} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white border border-white/30">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {fullscreenPaused && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white border border-neutral-700">
                  <Play className="h-6 w-6" />
                </span>
              </div>
            )}

            {/* COLONNE D'ICÔNES (vues / commentaires / partage), façon TikTok */}
            <div
              className="absolute right-3 z-20 flex flex-col items-center gap-4"
              style={{ bottom: 'calc(8rem + env(safe-area-inset-bottom))' }}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <Link
                to={`/users/${currentFullscreenReel.seller?.id ?? ''}`}
                onClick={(e) => { if (!currentFullscreenReel.seller?.id) e.preventDefault(); }}
                className="flex flex-col items-center gap-1"
                aria-label="Voir le profil du vendeur"
              >
                <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full border-2 border-white bg-neutral-700">
                  {currentFullscreenReel.seller?.avatar ? (
                    <img src={getMediaUrl(currentFullscreenReel.seller.avatar)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserIcon className="h-full w-full p-2 text-white" />
                  )}
                </span>
                <span className="max-w-[3.5rem] truncate text-xs font-semibold text-white">{currentFullscreenReel.seller?.name || 'Vendeur'}</span>
              </Link>

              <div className="flex flex-col items-center gap-1">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-black text-white">
                  <Eye className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-white">{formatCount(currentReelStats.views)}</span>
              </div>

              <button
                type="button"
                onClick={openComments}
                className="flex flex-col items-center gap-1"
                aria-label="Voir les commentaires"
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-black text-white">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-white">{formatCount(currentReelStats.comments)}</span>
              </button>

              <button
                type="button"
                onClick={shareReel}
                className="flex flex-col items-center gap-1"
                aria-label="Partager ce produit"
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-black text-white">
                  <Share2 className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-white">Partager</span>
              </button>
            </div>

            {deliveryLoading && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-6">
                <div className="rounded-2xl border border-neutral-700 bg-black px-6 py-5 text-center text-white">
                  <p className="text-sm font-semibold">Veuillez patienter…</p>
                  <p className="mt-1 text-xs font-medium text-neutral-300">Vérification du produit en cours.</p>
                </div>
              </div>
            )}

            {shareConfirm && (
              <div
                className="absolute inset-x-0 z-30 flex justify-center px-4"
                style={{ top: 'calc(4.5rem + env(safe-area-inset-top))' }}
              >
                <span className="rounded-full border border-neutral-700 bg-black px-4 py-2 text-xs font-semibold text-white">
                  Lien copié
                </span>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pt-10 text-white" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
                {currentReelDescription && (
                  <div
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                  >
                    <p className={`text-xs leading-relaxed text-neutral-200 ${descriptionExpanded ? '' : 'line-clamp-1'}`}>
                      {currentReelDescription}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((v) => !v)}
                      className="mt-0.5 text-xs font-semibold text-white"
                    >
                      {descriptionExpanded ? 'Voir moins' : 'Voir plus'}
                    </button>
                  </div>
                )}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{fullscreenProduct?.title || currentFullscreenReel.caption}</p>
                    {fullscreenProduct && <p className="text-xs font-semibold text-white">{fullscreenProduct.priceUSD} $</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { closeFullscreenReel(); handleDeliveryRequest(currentFullscreenReel.productId); }}
                      className="flex-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-200 sm:flex-none"
                    >
                      Me faire livrer
                    </button>
                    <button
                      type="button"
                      onClick={() => { closeFullscreenReel(); goToProductDetails(currentFullscreenReel.productId); }}
                      className="flex-1 rounded-xl bg-white border border-white px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-200 sm:flex-none"
                    >
                      Voir
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* PANNEAU DE COMMENTAIRES */}
            {showComments && (
              <div
                className="absolute inset-x-0 bottom-0 z-40 flex h-[70%] flex-col rounded-t-2xl border-t-2 border-neutral-700 bg-black"
                role="dialog"
                aria-modal="true"
                aria-label="Commentaires"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="flex flex-shrink-0 items-center justify-between border-b-2 border-neutral-800 px-4 py-3">
                  <p className="text-sm font-semibold text-white">
                    Commentaires <span className="text-white">({formatCount(currentReelStats.comments)})</span>
                  </p>
                  <button
                    type="button"
                    onClick={closeComments}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 bg-black text-white"
                    aria-label="Fermer les commentaires"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {commentsError && (
                    <div className="mb-3 rounded-lg border border-white bg-black p-3 text-sm font-semibold text-white">
                      {commentsError}
                    </div>
                  )}

                  {comments.length === 0 && !commentsLoading && !commentsError && (
                    <div className="py-8 text-center text-sm font-medium text-neutral-200">
                      Aucun commentaire. Soyez le premier à écrire.
                    </div>
                  )}

                  {comments.length > 0 && (
                    <div className="flex flex-col gap-3.5">
                      {comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-2.5">
                          <span className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-neutral-700 bg-neutral-700">
                            {c.user?.avatar ? (
                              <img src={getMediaUrl(c.user.avatar)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <UserIcon className="h-full w-full p-1 text-white" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white">{c.user?.name || 'Utilisateur'}</p>
                            <p className="mt-0.5 break-words text-sm text-white">{c.content}</p>
                          </div>
                          {token && user?.id === c.userId && (
                            <button
                              type="button"
                              onClick={() => deleteComment(c.id)}
                              className="flex-shrink-0 text-xs font-semibold text-neutral-300 hover:text-white"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {commentsLoading && (
                    <div className="py-4 text-center text-xs font-medium text-neutral-200">Chargement…</div>
                  )}

                  {!commentsLoading && commentsHasMore && (
                    <button
                      type="button"
                      onClick={loadMoreComments}
                      className="mx-auto mt-3 block rounded-full border border-neutral-700 px-4 py-1.5 text-xs font-semibold text-white hover:border-white"
                    >
                      Voir plus
                    </button>
                  )}
                </div>

                <div className="flex-shrink-0 border-t-2 border-neutral-800 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
                  {token ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); }}
                        maxLength={300}
                        placeholder="Écrire un commentaire..."
                        className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-black px-4 py-2.5 text-sm font-medium text-white placeholder-neutral-300 outline-none focus:border-white"
                      />
                      <button
                        type="button"
                        onClick={submitComment}
                        disabled={commentSubmitting || commentText.trim().length === 0}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-black disabled:opacity-50"
                        aria-label="Envoyer le commentaire"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { closeComments(); openAuth(); }}
                      className="w-full rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200"
                    >
                      Se connecter pour commenter
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAuth && React.createElement(
          AuthSheet as unknown as React.ComponentType<{
            onClose: () => void;
            onSuccess: (nextUser: User) => void;
          }>,
          { onClose: () => setShowAuth(false), onSuccess: handleAuthSuccess }
        )}
      </AnimatePresence>
    </div>
  );
}