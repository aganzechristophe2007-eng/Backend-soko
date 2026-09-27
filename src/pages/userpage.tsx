import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Star, Package, Tag, User as UserIcon, MessageCircle, BadgeCheck } from 'lucide-react';
import { BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

function getMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

interface SellerProduct {
  id: string;
  title: string;
  images: string[];
  priceUSD: number;
  priceCDF: number;
  isSold: boolean;
  createdAt: string;
}

interface SellerProfile {
  id: string;
  name: string;
  avatar: string | null;
  memberSince: string;
  productsCount: number;
  averageRating: number | null;
  reviewCount: number;
  topCategory: { id: string; name: string; count: number } | null;
  products: SellerProduct[];
}

export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/users/${id}/profile`, { credentials: 'include' });
        if (!res.ok) throw new Error('Profil introuvable');
        const { data } = await res.json();
        if (!cancelled) setProfile(data);
      } catch (err) {
        console.error('Erreur chargement profil', err);
        if (!cancelled) setError('Impossible de charger ce profil.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleMessage = () => {
    if (!profile) return;
    navigate('/messages', {
      state: { partner: { id: profile.id, name: profile.name, avatar: profile.avatar } },
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base truncate">{profile?.name || 'Profil'}</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {loading && <p className="py-8 text-center text-sm text-neutral-400">Chargement…</p>}

        {!loading && error && (
          <div className="rounded-xl border border-red-600/40 bg-red-600/10 p-4 text-center text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && profile && (
          <>
            {/* En-tête profil */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
              <span className="h-24 w-24 overflow-hidden rounded-full bg-[#c2410c] border-2 border-neutral-700">
                {profile.avatar ? (
                  <img src={getMediaUrl(profile.avatar)} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-full w-full p-5 text-white" />
                )}
              </span>

              <div className="flex items-center gap-1.5">
                <h2 className="text-lg font-bold">{profile.name}</h2>
                {profile.reviewCount >= 5 && <BadgeCheck className="h-4 w-4 text-[#f97316]" aria-label="Vendeur actif" />}
              </div>

              {profile.reviewCount > 0 && profile.averageRating !== null ? (
                <div className="flex items-center gap-1 text-sm font-semibold text-[#f97316]">
                  <Star className="h-4 w-4 fill-current" />
                  {profile.averageRating.toFixed(1)} <span className="text-neutral-400">({profile.reviewCount} avis)</span>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">Pas encore d'avis</p>
              )}

              <button
                type="button"
                onClick={handleMessage}
                className="mt-2 flex items-center gap-2 rounded-full bg-[#c2410c] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#9a3412]"
              >
                <MessageCircle className="h-4 w-4" />
                Envoyer un message
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
                <Package className="mx-auto mb-1 h-5 w-5 text-neutral-400" />
                <p className="text-lg font-bold">{profile.productsCount}</p>
                <p className="text-xs text-neutral-400">Produits postés</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-center">
                <Tag className="mx-auto mb-1 h-5 w-5 text-neutral-400" />
                <p className="truncate text-sm font-bold">{profile.topCategory ? profile.topCategory.name : '—'}</p>
                <p className="text-xs text-neutral-400">Catégorie principale</p>
              </div>
            </div>

            {/* Grille des publications, façon TikTok */}
            <div>
              <h3 className="mb-2 px-1 text-sm font-bold text-neutral-300">
                Publications <span className="text-neutral-500">({profile.products.length})</span>
              </h3>

              {profile.products.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 py-10 text-center text-neutral-500">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm">Aucune publication pour l'instant.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {profile.products.map((product) => (
                    <Link
                      key={product.id}
                      to={`/products/${product.id}`}
                      className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
                    >
                      {product.images?.[0] ? (
                        <img
                          src={getMediaUrl(product.images[0])}
                          alt={product.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-neutral-800">
                          <Package className="h-6 w-6 text-neutral-600" />
                        </div>
                      )}

                      {product.isSold && (
                        <span className="absolute left-1 top-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          Vendu
                        </span>
                      )}

                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-1.5 pt-4 text-[11px] font-bold text-white">
                        {product.priceUSD} $
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}