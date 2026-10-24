import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ChevronRight, Loader2, Package, RefreshCw, Search, Store, X } from 'lucide-react';
import { api, ApiError } from '../lib/http';
import { BASE_URL } from '../api/client';
import { TourHelpButton, useGuidedTour } from '../components/guidedtour';
import { markShopsSeen, shopsSince } from '../lib/newShops';
import { BOUTIQUE_TOUR } from '../components/guidedtour/tours';

interface Shop {
  id: string;
  name: string;
  description?: string | null;
  logo?: string | null;
  verified: boolean;
  createdAt?: string;
  ownerId: string;
  productsCount: number;
  category: string | null;
}

interface Category { id: string; name: string }
type Sort = 'recent' | 'name' | 'products';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');
const logoUrl = (path?: string | null) => {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_ORIGIN}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`;
};

const PAGE_SIZE = 24;

export default function Boutique() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const [shops, setShops] = useState<Shop[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  // Repère de « nouveauté » figé à l'arrivée sur la page : les boutiques créées depuis la dernière visite sont marquées.
  const seenBefore = useRef<number>(shopsSince());

  useEffect(() => {
    api<{ categories: Category[] }>('/categories').then((res) => setCategories(res.categories || [])).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const buildQuery = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams({ sort, limit: String(PAGE_SIZE), page: String(nextPage) });
      if (debounced) params.set('q', debounced);
      if (category) params.set('category', category);
      return `/shops?${params.toString()}`;
    },
    [debounced, category, sort]
  );

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: Shop[]; total: number }>(buildQuery(1));
      if (id !== requestId.current) return;
      setShops(res.data);
      setTotal(res.total);
      setPage(1);
      markShopsSeen(); // la liste a été vue : le badge « nouvelles boutiques » repart à zéro
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof ApiError ? e.message : 'Impossible de charger les boutiques.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<{ data: Shop[]; total: number }>(buildQuery(page + 1));
      setShops((prev) => [...prev, ...res.data.filter((s) => !prev.some((p) => p.id === s.id))]);
      setTotal(res.total);
      setPage((p) => p + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger la suite.');
    } finally {
      setLoadingMore(false);
    }
  };

  const ready = !loading && !error;
  const { start, tour } = useGuidedTour({ id: 'boutique', steps: BOUTIQUE_TOUR, ready });
  const filtersActive = !!(debounced || category);
  const resetFilters = () => { setSearch(''); setDebounced(''); setCategory(''); };

  return (
    <div className="min-h-screen bg-white pb-10 text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Retour à l'accueil"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#111111] transition-colors hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Boutiques partenaires</h1>
            <p className="text-xs text-[#667085]" aria-live="polite">
              {loading && shops.length === 0 ? 'Chargement…' : `${total} boutique${total > 1 ? 's' : ''} à découvrir`}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#EAECF0] bg-[#F9FAFB] p-4 sm:p-5">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
            <Store className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">Achetez auprès de vendeurs de confiance</p>
            <p className="text-xs text-[#667085] sm:text-sm">Parcourez les boutiques partenaires de CBF SOKO et leurs articles.</p>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div data-tour="boutique-search" className="relative flex-1">
            <label htmlFor="shop-search" className="sr-only">Rechercher une boutique</label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#667085]" aria-hidden="true" />
            <input
              id="shop-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une boutique"
              maxLength={80}
              className="h-11 w-full rounded-full border border-[#D0D5DD] bg-white pl-10 pr-10 text-sm outline-none focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/20"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche" className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#667085] hover:bg-[#F2F4F7]">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div data-tour="boutique-sort" className="flex-shrink-0">
            <label htmlFor="shop-sort" className="sr-only">Trier les boutiques</label>
            <select
              id="shop-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-11 w-full rounded-full border border-[#D0D5DD] bg-white px-4 text-sm font-medium outline-none focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/20 sm:w-auto"
            >
              <option value="recent">Plus récentes</option>
              <option value="products">Plus d’articles</option>
              <option value="name">Nom (A–Z)</option>
            </select>
          </div>
        </div>

        {categories.length > 0 && (
          <div data-tour="boutique-categories" role="group" aria-label="Filtrer par catégorie" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {[{ id: '', name: 'Toutes' }, ...categories].map((c) => (
              <button
                key={c.id || 'all'}
                type="button"
                aria-pressed={category === c.id}
                onClick={() => setCategory(c.id)}
                className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${category === c.id ? 'bg-[#111111] text-white' : 'bg-[#F2F4F7] text-[#344054] hover:bg-[#EAECF0]'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loading && shops.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-[#EAECF0] p-4">
                <span className="skeleton h-12 w-12" />
                <span className="flex-1 space-y-2"><span className="skeleton block h-3 w-2/3" /><span className="skeleton block h-3 w-1/3" /></span>
              </div>
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-[#FDA29B] bg-[#FEF3F2] px-5 py-10 text-center">
            <p className="text-sm font-bold text-[#B42318]">{error}</p>
            <button type="button" onClick={load} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#344054]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
            </button>
          </div>
        ) : shops.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D0D5DD] py-14 text-center text-sm text-[#667085]">
            <Store className="mx-auto mb-2 h-8 w-8 opacity-40" aria-hidden="true" />
            {filtersActive ? 'Aucune boutique ne correspond à votre recherche.' : 'Aucune boutique pour le moment.'}
            {filtersActive && (
              <div className="mt-4">
                <button type="button" onClick={resetFilters} className="rounded-full border border-[#D0D5DD] px-4 py-2 text-xs font-semibold text-[#344054] hover:border-[#FF6B00] hover:text-[#FF6B00]">
                  Effacer les filtres
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {shops.map((shop, index) => {
                const logo = logoUrl(shop.logo);
                const isNew = !!shop.createdAt && new Date(shop.createdAt).getTime() > seenBefore.current;
                return (
                  <li
                    key={shop.id}
                    data-tour={index === 0 ? 'boutique-shop' : undefined}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-[#EAECF0] bg-white p-4 transition-colors hover:bg-[#F9FAFB]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FFF1E7] text-[#FF6B00]">
                        {logo ? <img src={logo} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Store className="h-6 w-6" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-1 truncate text-sm font-bold">
                          <span className="truncate">{shop.name}</span>
                          {isNew && <span className="flex-shrink-0 rounded-full bg-[#12B76A] px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-white">Nouveau</span>}
                          {shop.verified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-[#10b981]" aria-label="Boutique vérifiée" />}
                        </h2>
                        <p className="mt-0.5 truncate text-xs text-[#667085]">{shop.category || 'Catégories variées'}</p>
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-medium text-[#344054]">
                          <Package className="h-3 w-3" aria-hidden="true" />
                          {shop.productsCount} article{shop.productsCount > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/shops/${shop.id}`)}
                      aria-label={`Visiter la boutique ${shop.name}`}
                      data-tour={index === 0 ? 'boutique-visit' : undefined}
                      className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#FF6B00] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
                    >
                      Visiter
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {shops.length < total && (
              <button type="button" onClick={loadMore} disabled={loadingMore} className="mx-auto mt-5 flex items-center gap-2 rounded-full border border-[#D0D5DD] px-5 py-2.5 text-xs font-semibold text-[#344054] hover:border-[#FF6B00] hover:text-[#FF6B00] disabled:opacity-60">
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Voir plus de boutiques
              </button>
            )}
          </>
        )}
      </main>

      <TourHelpButton onClick={start} />
      {tour}
    </div>
  );
}
