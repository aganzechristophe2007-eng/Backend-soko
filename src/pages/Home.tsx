import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Camera, MessageSquare, Bell, Package,
  MapPin, ChevronRight, User as UserIcon,
  Volume2, VolumeX, Store,
  Images, X, Play, Settings as SettingsIcon, Sparkles,
  Eye, MessageCircle, Share2, Send, MoreHorizontal
} from 'lucide-react';
import { apiFetch, BASE_URL } from '../api/client';
import AuthSheet from './Authsheet';
import { useAuth } from '../context/Authcontext';

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

// Thème "Commerce Noir & Orange" : noir pur opaque, sans image de nature ni décor.
// Orange #c2410c pour les boutons (texte blanc dessus), orange #f97316 pour les prix et accents sur noir.
const DEFAULT_BACKGROUND = '#000000';

// L'ancien fond "Kivu Nature" éventuellement enregistré est ignoré au profit du noir.
const readSavedBg = (): string => {
  const saved = localStorage.getItem('cbfsoko-custom-bg');
  if (!saved || saved.includes('photo-1507525428034')) return DEFAULT_BACKGROUND;
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
  { to: '/legal/mentions-legales', label: 'Mentions légales' },
  { to: '/legal/cgu', label: "Conditions d'utilisation" },
  { to: '/legal/confidentialite', label: 'Politique de confidentialité' },
  { to: '/legal/cookies', label: 'Cookies et stockage local' },
];

// 184690000 -> "184 690 000"
const formatCDF = (value: number): string => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const SectionHeader = ({ title, action }: { title: string; action?: React.ReactNode }) => (
  <div className="mb-3 flex items-center justify-between gap-3 px-1">
    <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
      <span className="h-6 w-1.5 rounded-sm bg-[#f97316]" aria-hidden="true" />
      {title}
    </h2>
    {action}
  </div>
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
        ? 'text-[#f97316]'
        : 'text-white hover:text-[#f97316]'
      : active
        ? 'bg-[#c2410c] text-white'
        : 'text-white hover:bg-neutral-800';

  const layout =
    variant === 'top'
      ? 'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold'
      : 'flex w-full flex-col items-center gap-1 text-xs font-semibold transition-colors duration-150';

  const className = `${layout} ${state} focus-visible:outline-none`;

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

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const wheelLockRef = useRef<boolean>(false);

  const [showAuth, setShowAuth] = useState<boolean>(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  // Vues / commentaires des reels (colonne d'icônes façon TikTok)
  const [reelStatsOverride, setReelStatsOverride] = useState<Record<string, ReelStats>>({});
  const [shareConfirm, setShareConfirm] = useState<boolean>(false);
  const shareConfirmTimerRef = useRef<number | null>(null);

  // Menu "..." des cartes produit + confirmation de copie du lien
  const [menuProductId, setMenuProductId] = useState<string | null>(null);
  const [cardShareToast, setCardShareToast] = useState<boolean>(false);
  const cardShareTimerRef = useRef<number | null>(null);

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
    page: 'text-white selection:bg-orange-500 selection:text-white',
    header: 'bg-black border-b-2 border-neutral-600',
    surface: 'bg-black hover:border-[#f97316]',
    soft: 'bg-neutral-800',
    border: 'border-neutral-500 border',
    muted: 'text-neutral-200',
    mobileNav: 'bg-black border-t-2 border-neutral-600',
  };

  const iconBtn = 'relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-neutral-600 bg-black text-white transition-colors hover:border-white focus-visible:outline-none';

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
          handleProtectedAction(`/products/${currentFullscreenReel.productId}?livraison=1`);
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

  // Ferme le menu "..." d'une carte au clic ailleurs ou avec Échap
  useEffect(() => {
    if (menuProductId === null) return;
    const close = () => setMenuProductId(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuProductId]);

  const shareProduct = useCallback(async (product: ProductItem) => {
    setMenuProductId(null);
    const url = `${window.location.origin}/products/${product.id}`;

    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: product.title, url });
      } catch {
        /* Partage annulé : rien à faire. */
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCardShareToast(true);
      if (cardShareTimerRef.current) window.clearTimeout(cardShareTimerRef.current);
      cardShareTimerRef.current = window.setTimeout(() => setCardShareToast(false), 2000);
    } catch {
      /* Presse-papiers indisponible. */
    }
  }, []);

  const path = location.pathname;
  const navItems: NavItem[] = [
    { key: 'orders', label: 'Commandes', icon: <Package className="h-6 w-6" />, active: path.startsWith('/orders'), onClick: () => handleProtectedAction('/orders'), mobile: true },
    { key: 'shop', label: 'Boutique', icon: <Store className="h-6 w-6" />, active: path.startsWith('/boutique'), to: '/boutique', mobile: true },
    { key: 'messages', label: 'Messages', icon: <MessageSquare className="h-6 w-6" />, active: path.startsWith('/messages'), onClick: () => handleProtectedAction('/messages'), mobile: true },
    {
      key: 'profile',
      label: 'Profil',
      icon: token && user?.avatar ? (
        <span className="h-6 w-6 overflow-hidden rounded-full bg-[#c2410c]">
          <img src={getMediaUrl(user.avatar)} alt={user.name} className="h-full w-full object-cover" />
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

  const mobileItems = navItems;
  const mobileMid = 2;

  return (
    <div
      className={`relative flex min-h-screen flex-col ${t.page}`}
      style={{
        background: customBg,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <header className={`sticky top-0 z-50 ${t.header}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap sm:px-6 lg:px-8">
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Texte mat (orange sombre sans effet lumineux) et icône panier sans bordure */}
            <Link to="/" className="flex items-center gap-2 px-1 py-1 transition-transform hover:scale-105" aria-label="CBFSOKO, accueil">
              <span className="text-xl sm:text-2xl font-black tracking-wider">
                <span className="text-[#10b981]">CBF</span>
                <span className="text-[#f97316]">SOKO</span>
              </span>
              <svg className="h-7 w-7 flex-shrink-0 text-[#f97316]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
            </Link>
          </div>

          <form onSubmit={handleSearch} className="order-last w-full sm:order-none sm:mx-2 sm:w-auto sm:max-w-md sm:flex-1">
            <div className="flex h-11 w-full min-w-0 items-center gap-2 rounded-full border-2 border-neutral-500 bg-black pl-4 pr-1 transition-colors focus-within:border-[#f97316]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex : téléphone moins de 150 $"
                maxLength={200}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white placeholder-neutral-300 outline-none"
              />
              <button
                type="submit"
                disabled={searchLoading}
                aria-label="Rechercher"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#c2410c] text-white transition-colors hover:bg-[#9a3412] disabled:opacity-60"
              >
                {searchLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>

          <div className="ml-auto flex flex-shrink-0 items-center gap-1">
            <Link to="/settings" className={iconBtn} title="Paramètres">
              <SettingsIcon className="h-4 w-4" />
            </Link>

            <button type="button" onClick={() => handleProtectedAction('/notifications')} className={iconBtn} title="Notifications">
              <Bell className="h-4 w-4" />
            </button>

            {token ? (
              <button
                type="button"
                onClick={() => handleProtectedAction('/profile')}
                className="ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#c2410c] font-bold text-white transition-transform hover:scale-105"
                title="Mon profil"
              >
                {user?.avatar ? (
                  <img src={getMediaUrl(user.avatar)} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-4 w-4" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth()}
                className="ml-1 flex h-9 flex-shrink-0 items-center rounded-full bg-white px-4 text-sm font-bold text-black transition-transform hover:scale-105"
              >
                Connexion
              </button>
            )}
          </div>
        </div>

        {/* NAVIGATION ORDINATEUR : mêmes options que la barre du bas sur mobile */}
        <div className="hidden border-t border-neutral-800 md:block">
          <nav aria-label="Navigation principale" className="mx-auto flex max-w-7xl items-center gap-1 px-3 py-2 sm:px-6 lg:px-8 [&_svg]:h-5 [&_svg]:w-5">
            {navItems.map((item) => renderTab(item, 'top'))}
            <button
              type="button"
              onClick={() => handleProtectedAction('/create-product')}
              className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#ea580c] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#c2410c]"
            >
              <Camera className="h-5 w-5" />
              Poster
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 pb-6">
        {/* NOUVEAUTÉS / REELS MINIATURISÉS */}
        <section className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 lg:px-8">
          <SectionHeader title="Découvrir les nouveautés" />
          {loadingProducts ? (
            <div className="flex gap-3 overflow-x-hidden pb-1">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-[9/16] w-28 flex-shrink-0 animate-pulse rounded-lg bg-neutral-800 sm:w-32" />
              ))}
            </div>
          ) : displayedReels.length === 0 ? (
            <div className={`rounded-xl border border-dashed py-6 text-center text-xs ${t.border} ${t.surface} ${t.muted}`}>Aucune vidéo.</div>
          ) : (
            <div className="scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
              {displayedReels.map((reel) => (
                <div
                  key={reel.id}
                  className="group relative aspect-[9/16] w-28 flex-shrink-0 cursor-pointer snap-start overflow-hidden rounded-lg border border-neutral-500 bg-black transition-colors duration-200 hover:border-[#f97316] sm:w-32"
                  onClick={() => openFullscreenReelById(reel.id)}
                >
                  <video
                    ref={(el) => { videoRefs.current[reel.id] = el; if (el) el.muted = isReelMuted(reel.id); }}
                    src={reel.videoUrl}
                    poster={reel.thumbnail}
                    loop
                    playsInline
                    autoPlay
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute left-1.5 top-1.5 z-10 flex max-w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-full bg-black py-0.5 pl-0.5 pr-2">
                    <span className="h-5 w-5 flex-shrink-0 overflow-hidden rounded-full bg-[#c2410c]">
                      {reel.seller?.avatar ? (
                        <img src={getMediaUrl(reel.seller.avatar)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserIcon className="h-full w-full p-0.5 text-white" />
                      )}
                    </span>
                    <span className="truncate text-xs font-bold text-white">
                      {reel.seller?.name || 'Vendeur'}
                    </span>
                  </div>

                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleReelMute(reel.id); }} className="absolute bottom-2 right-2 z-10 rounded-full border border-neutral-500 bg-black p-1.5 text-white">
                    {isReelMuted(reel.id) ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CATÉGORIES */}
        {categories.length > 0 && (
          <section className="mx-auto max-w-7xl px-3 pt-4 sm:px-6 lg:px-8">
            <div className="scrollbar-hide flex gap-2.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setActiveCategoryId(null)}
                aria-pressed={activeCategoryId === null}
                className={`h-10 flex-shrink-0 rounded-full border px-5 text-sm font-bold transition-colors ${
                  activeCategoryId === null ? 'border-[#ea580c] bg-[#ea580c] text-white' : 'border-neutral-700 bg-[#0d0d0d] text-white hover:border-white'
                }`}
              >
                Tous
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategoryId(cat.id)}
                  aria-pressed={activeCategoryId === cat.id}
                  className={`h-10 flex-shrink-0 rounded-full border px-5 text-sm font-bold transition-colors ${
                    activeCategoryId === cat.id ? 'border-[#ea580c] bg-[#ea580c] text-white' : 'border-neutral-700 bg-[#0d0d0d] text-white hover:border-white'
                  }`}
                >
                  {cat.name} ({categoryCounts[cat.id] ?? 0})
                </button>
              ))}
            </div>
          </section>
        )}

        {/* PRODUITS */}
        <section className="mx-auto max-w-7xl px-3 py-4 sm:px-6 lg:px-8">
          <SectionHeader
            title={searchResults !== null ? 'Résultats de la recherche' : 'Les annonces récentes'}
            action={
              searchResults !== null ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="flex items-center gap-1 rounded-full border border-white bg-black px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-white hover:text-black"
                >
                  <X className="h-4 w-4" />
                  Effacer
                </button>
              ) : (
                <Link to="/products" className="flex items-center gap-0.5 rounded-full border border-neutral-500 px-3 py-1.5 text-sm font-bold text-white hover:border-white">
                  Tout voir
                </Link>
              )
            }
          />

          {searchError && (
            <div className="mb-3 rounded-lg border border-[#f97316] bg-black p-3 text-sm font-bold text-white">{searchError}</div>
          )}

          {searchInfo && searchResults !== null && (
            <div className="mb-3 rounded-lg border border-neutral-500 bg-black p-3">
              <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Sparkles className="h-4 w-4 flex-shrink-0 text-[#f97316]" />
                <span className="min-w-0 break-words">{searchInfo.ai ? 'Recherche intelligente' : 'Recherche'} : « {searchInfo.query} »</span>
              </p>
              {searchChips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {searchChips.map((chip) => (
                    <span key={chip} className="rounded-full border border-neutral-500 bg-black px-2.5 py-1 text-xs font-bold text-white">
                      {chip}
                    </span>
                  ))}
                </div>
              )}
              {searchInfo.relaxed && (
                <p className="mt-2 text-xs font-bold text-[#f97316]">Aucun résultat exact : les critères ont été élargis.</p>
              )}
            </div>
          )}

          {loadingProducts || searchLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-neutral-700 bg-black p-3">
                  <div className="aspect-square w-full rounded-md bg-neutral-800" />
                  <div className="mt-3 h-3 w-3/4 rounded bg-neutral-800" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-neutral-800" />
                </div>
              ))}
            </div>
          ) : displayedProducts.length === 0 ? (
            <div className={`rounded-xl border border-dashed py-8 text-center text-sm font-semibold ${t.border} ${t.muted}`}>
              {searchResults !== null ? 'Aucun résultat pour cette recherche.' : 'Aucune annonce.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {displayedProducts.map((product) => {
                const photoCount = product.images?.length ?? 0;
                const isDemand = product.type?.toUpperCase() === 'DEMANDE' || /^\s*\[demande\]/i.test(product.title);
                const menuOpen = menuProductId === product.id;
                return (
                  <article
                    key={product.id}
                    onClick={() => goToProductDetails(product.id)}
                    className="group cursor-pointer rounded-2xl border border-neutral-700 bg-[#0d0d0d] p-2.5 transition-colors duration-200 hover:border-[#f97316]"
                  >
                    <div className="relative aspect-square w-full">
                      <div className="h-full w-full overflow-hidden rounded-xl bg-neutral-900">
                        <img
                          src={getMediaUrl(product.images?.[0])}
                          alt={product.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>

                      {product.category?.name && (
                        <span className="absolute left-2 top-2 max-w-[60%] truncate rounded-md border border-neutral-500 bg-black px-2 py-1 text-[11px] font-bold text-white">
                          {product.category.name}
                        </span>
                      )}

                      <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
                        {isDemand && (
                          <span className="rounded-md bg-[#ea580c] px-2 py-1 text-[11px] font-extrabold text-white">DEMANDE</span>
                        )}
                        <div className="relative">
                          <button
                            type="button"
                            aria-label="Plus d'options"
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={(e) => { e.stopPropagation(); setMenuProductId(menuOpen ? null : product.id); }}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-500 bg-black text-white hover:border-white"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menuOpen && (
                            <div
                              role="menu"
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-neutral-500 bg-black p-1"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => shareProduct(product)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-white hover:bg-neutral-800"
                              >
                                <Share2 className="h-4 w-4" /> Partager
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setMenuProductId(null); goToProductDetails(product.id); }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-white hover:bg-neutral-800"
                              >
                                <ChevronRight className="h-4 w-4" /> Voir l'annonce
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {photoCount > 1 && (
                        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md border border-neutral-500 bg-black px-1.5 py-0.5 text-xs font-bold text-white">
                          <Images className="h-3.5 w-3.5 text-[#f97316]" />
                          {photoCount}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 min-w-0 px-0.5">
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-neutral-200">
                        <span className="truncate">{product.seller?.name || 'Vendeur'}</span>
                        {product.location && (
                          <span className="flex flex-shrink-0 items-center gap-1">
                            <MapPin className="h-3 w-3 text-[#f97316]" />
                            {product.location}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate text-base font-extrabold text-white">{product.title}</p>
                      <p className="text-lg font-extrabold text-[#f97316]">{product.priceUSD} $</p>
                      {product.priceCDF > 0 && (
                        <p className="text-[11px] font-semibold text-neutral-400">≈ {formatCDF(product.priceCDF)} CDF</p>
                      )}
                    </div>

                    <button
                      type="button"
                      className="mt-3 h-10 w-full rounded-xl border border-[#7c2d12] bg-[#1c0f08] text-sm font-bold text-[#f97316] transition-colors hover:bg-[#2a150a]"
                    >
                      Voir
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

      </main>

      {/* PIED DE PAGE LÉGAL */}
      <footer className="border-t-2 border-neutral-700 bg-black pb-28 pt-8 md:pb-8">
        <div className="mx-auto grid max-w-7xl gap-8 px-3 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <p className="text-xl font-black tracking-wider">
              <span className="text-[#10b981]">CBF</span>
              <span className="text-[#f97316]">SOKO</span>
            </p>
            <p className="mt-2 max-w-xs text-sm font-semibold text-neutral-300">
              CBFSOKO met en relation acheteurs et vendeurs. Chaque annonce est publiée sous la seule responsabilité de son auteur.
            </p>
          </div>

          <nav aria-label="Informations légales">
            <h2 className="text-sm font-extrabold text-white">Informations légales</h2>
            <ul className="mt-3 space-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm font-semibold text-neutral-300 hover:text-[#f97316]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-extrabold text-white">Éditeur du site</h2>
            <dl className="mt-3 space-y-1.5 text-sm font-semibold text-neutral-300">
              {LEGAL_ROWS.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="text-neutral-400">{label} :</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
              {LEGAL_INFO.email && (
                <div className="flex gap-2">
                  <dt className="text-neutral-400">Email :</dt>
                  <dd className="min-w-0 break-words">
                    <a href={`mailto:${LEGAL_INFO.email}`} className="hover:text-[#f97316]">{LEGAL_INFO.email}</a>
                  </dd>
                </div>
              )}
              {LEGAL_INFO.phone && (
                <div className="flex gap-2">
                  <dt className="text-neutral-400">Téléphone :</dt>
                  <dd>
                    <a href={`tel:${LEGAL_INFO.phone.replace(/\s/g, '')}`} className="hover:text-[#f97316]">{LEGAL_INFO.phone}</a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-7xl border-t border-neutral-800 px-3 pt-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-neutral-400">
            Les prix en francs congolais (CDF) sont des conversions indicatives des prix en dollars américains (USD).
          </p>
          <p className="mt-1 text-xs font-semibold text-neutral-400">
            © {new Date().getFullYear()} {LEGAL_INFO.companyName}. Tous droits réservés.
          </p>
        </div>
      </footer>

      {cardShareToast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[70] flex justify-center px-4 md:bottom-8" role="status">
          <span className="rounded-full border border-neutral-500 bg-black px-4 py-2 text-xs font-bold text-white">Lien copié</span>
        </div>
      )}

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
              aria-label="Poster une annonce"
              className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#ea580c] text-white shadow-[0_6px_16px_rgba(234,88,12,0.45)] ring-4 ring-black transition-transform hover:bg-[#c2410c] active:scale-95"
            >
              <Camera className="h-6 w-6" />
            </button>
            <span className="mt-1 text-xs font-bold text-[#f97316]">Poster</span>
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
              className="h-full w-full object-contain cursor-pointer"
              autoPlay
              loop
              playsInline
              onClick={toggleFullscreenPlay}
              onPlay={() => setFullscreenPaused(false)}
              onPause={() => setFullscreenPaused(true)}
            />

            <div className="absolute inset-x-3 top-3 z-20 flex items-center justify-between" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
              <div className="flex items-center gap-2.5 rounded-xl bg-black px-3 py-1.5 border border-neutral-500">
                <span className="h-8 w-8 overflow-hidden rounded-full bg-[#c2410c] flex-shrink-0 border border-neutral-400">
                  {currentFullscreenReel.seller?.avatar ? (
                    <img src={getMediaUrl(currentFullscreenReel.seller.avatar)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserIcon className="h-full w-full p-1 text-white" />
                  )}
                </span>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-[#f97316]">Reel :</span>
                    <span className="text-xs font-bold text-white truncate max-w-[130px] sm:max-w-xs">{fullscreenProduct?.title || currentFullscreenReel.caption}</span>
                  </div>
                  <span className="text-xs text-white">Par <strong className="text-white">{currentFullscreenReel.seller?.name || 'Vendeur'}</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={toggleFullscreenMute} className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white border border-neutral-500">
                  {fullscreenMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <button type="button" onClick={closeFullscreenReel} className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white border border-neutral-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {fullscreenPaused && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white border border-neutral-500">
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
              <div className="flex flex-col items-center gap-1">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-black text-white">
                  <Eye className="h-5 w-5" />
                </span>
                <span className="text-xs font-extrabold text-[#f97316]">{formatCount(currentReelStats.views)}</span>
              </div>

              <button
                type="button"
                onClick={openComments}
                className="flex flex-col items-center gap-1"
                aria-label="Voir les commentaires"
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-black text-white">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="text-xs font-extrabold text-[#f97316]">{formatCount(currentReelStats.comments)}</span>
              </button>

              <button
                type="button"
                onClick={shareReel}
                className="flex flex-col items-center gap-1"
                aria-label="Partager ce produit"
              >
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-neutral-500 bg-black text-white">
                  <Share2 className="h-5 w-5" />
                </span>
                <span className="text-xs font-bold text-white">Partager</span>
              </button>
            </div>

            {shareConfirm && (
              <div
                className="absolute inset-x-0 z-30 flex justify-center px-4"
                style={{ top: 'calc(4.5rem + env(safe-area-inset-top))' }}
              >
                <span className="rounded-full border border-neutral-500 bg-black px-4 py-2 text-xs font-bold text-white">
                  Lien copié
                </span>
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 z-10 border-t-2 border-neutral-500 bg-black px-3 pt-2.5 text-white" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
                {currentReelDescription && (
                  <div
                    className="max-h-20 overflow-y-auto pr-8 text-xs leading-relaxed text-neutral-200"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {currentReelDescription}
                  </div>
                )}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{fullscreenProduct?.title || currentFullscreenReel.caption}</p>
                    {fullscreenProduct && <p className="text-xs font-extrabold text-[#f97316]">{fullscreenProduct.priceUSD} $</p>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { closeFullscreenReel(); navigate(`/products/${currentFullscreenReel.productId}?livraison=1`); }}
                      className="flex-1 rounded-xl bg-[#c2410c] px-3 py-2 text-xs font-bold text-white hover:bg-[#9a3412] sm:flex-none"
                    >
                      Me faire livrer
                    </button>
                    <button
                      type="button"
                      onClick={() => { closeFullscreenReel(); goToProductDetails(currentFullscreenReel.productId); }}
                      className="flex-1 rounded-xl bg-white border border-white px-3 py-2 text-xs font-bold text-black hover:bg-neutral-200 sm:flex-none"
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
                className="absolute inset-x-0 bottom-0 z-40 flex h-[70%] flex-col rounded-t-2xl border-t-2 border-neutral-500 bg-black"
                role="dialog"
                aria-modal="true"
                aria-label="Commentaires"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="flex flex-shrink-0 items-center justify-between border-b-2 border-neutral-600 px-4 py-3">
                  <p className="text-sm font-extrabold text-white">
                    Commentaires <span className="text-[#f97316]">({formatCount(currentReelStats.comments)})</span>
                  </p>
                  <button
                    type="button"
                    onClick={closeComments}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-500 bg-black text-white"
                    aria-label="Fermer les commentaires"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  {commentsError && (
                    <div className="mb-3 rounded-lg border border-[#f97316] bg-black p-3 text-sm font-bold text-white">
                      {commentsError}
                    </div>
                  )}

                  {comments.length === 0 && !commentsLoading && !commentsError && (
                    <div className="py-8 text-center text-sm font-semibold text-neutral-200">
                      Aucun commentaire. Soyez le premier à écrire.
                    </div>
                  )}

                  {comments.length > 0 && (
                    <div className="flex flex-col gap-3.5">
                      {comments.map((c) => (
                        <div key={c.id} className="flex items-start gap-2.5">
                          <span className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full border border-neutral-500 bg-[#c2410c]">
                            {c.user?.avatar ? (
                              <img src={getMediaUrl(c.user.avatar)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <UserIcon className="h-full w-full p-1 text-white" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white">{c.user?.name || 'Utilisateur'}</p>
                            <p className="mt-0.5 break-words text-sm text-white">{c.content}</p>
                          </div>
                          {token && user?.id === c.userId && (
                            <button
                              type="button"
                              onClick={() => deleteComment(c.id)}
                              className="flex-shrink-0 text-xs font-bold text-neutral-300 hover:text-[#f97316]"
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {commentsLoading && (
                    <div className="py-4 text-center text-xs font-semibold text-neutral-200">Chargement…</div>
                  )}

                  {!commentsLoading && commentsHasMore && (
                    <button
                      type="button"
                      onClick={loadMoreComments}
                      className="mx-auto mt-3 block rounded-full border border-neutral-500 px-4 py-1.5 text-xs font-bold text-white hover:border-white"
                    >
                      Voir plus
                    </button>
                  )}
                </div>

                <div className="flex-shrink-0 border-t-2 border-neutral-600 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">
                  {token ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); }}
                        maxLength={300}
                        placeholder="Écrire un commentaire..."
                        className="min-w-0 flex-1 rounded-full border border-neutral-500 bg-black px-4 py-2.5 text-sm font-semibold text-white placeholder-neutral-300 outline-none focus:border-[#f97316]"
                      />
                      <button
                        type="button"
                        onClick={submitComment}
                        disabled={commentSubmitting || commentText.trim().length === 0}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#c2410c] text-white disabled:opacity-50"
                        aria-label="Envoyer le commentaire"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { closeComments(); openAuth(); }}
                      className="w-full rounded-full bg-[#c2410c] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#9a3412]"
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