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
    <div className="min-h-screen bg-white text-[#111111]">
      <header className="sticky top-0 z-30 border-b border-[#EAECF0] bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#344054] transition-colors hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">{profile?.name || 'Profil'}</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:py-8">
        {loading && (
          <div aria-busy="true" className="space-y-6">
            <div className="flex items-center gap-5 sm:gap-10">
              <div className="skeleton h-20 w-20 flex-shrink-0 !rounded-full sm:h-32 sm:w-32" />
              <div className="flex-1 space-y-3">
                <div className="skeleton h-5 w-1/2" />
                <div className="skeleton h-4 w-3/4" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton aspect-square !rounded-none" />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm font-semibold text-red-600">{error}</div>
        )}

        {!loading && !error && profile && (
          <>
            {/* En-tête profil, façon Instagram */}
            <section className="flex items-center gap-5 sm:gap-12">
              <span className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#EAECF0] bg-[#FFF1E7] sm:h-32 sm:w-32">
                {profile.avatar ? (
                  <img src={getMediaUrl(profile.avatar)} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-1/2 w-1/2 text-[#FF6B00]" aria-hidden="true" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-lg font-bold sm:text-xl">{profile.name}</h2>
                  {profile.reviewCount >= 5 && <BadgeCheck className="h-5 w-5 flex-shrink-0 text-[#FF6B00]" aria-label="Vendeur actif" />}
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center sm:max-w-sm sm:text-left">
                  <div>
                    <dd className="text-base font-bold sm:text-lg">{profile.productsCount}</dd>
                    <dt className="text-xs text-[#667085]">Produits</dt>
                  </div>
                  <div>
                    <dd className="flex items-center justify-center gap-1 text-base font-bold sm:justify-start sm:text-lg">
                      {profile.reviewCount > 0 && profile.averageRating !== null ? (
                        <>
                          <Star className="h-4 w-4 fill-[#FF6B00] text-[#FF6B00]" aria-hidden="true" />
                          {profile.averageRating.toFixed(1)}
                        </>
                      ) : (
                        '—'
                      )}
                    </dd>
                    <dt className="text-xs text-[#667085]">
                      {profile.reviewCount > 0 ? `${profile.reviewCount} avis` : "Pas d'avis"}
                    </dt>
                  </div>
                  <div className="min-w-0">
                    <dd className="truncate text-base font-bold sm:text-lg">{profile.topCategory ? profile.topCategory.name : '—'}</dd>
                    <dt className="text-xs text-[#667085]">Catégorie</dt>
                  </div>
                </dl>
              </div>
            </section>

            <button
              type="button"
              onClick={handleMessage}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2 sm:w-auto sm:min-w-[220px]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Envoyer un message
            </button>

            {/* Grille des publications, 3 colonnes */}
            <section className="mt-6 border-t border-[#EAECF0] pt-4" aria-label="Publications">
              <h3 className="mb-3 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-[#111111]">
                <Package className="h-4 w-4" aria-hidden="true" />
                Publications <span className="font-medium text-[#667085]">({profile.products.length})</span>
              </h3>

              {profile.products.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D0D5DD] py-14 text-center text-[#667085]">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                  <p className="text-sm font-medium">Aucune publication pour l'instant.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                  {profile.products.map((product) => (
                    <Link
                      key={product.id}
                      to={`/products/${product.id}`}
                      className="group relative block aspect-square overflow-hidden bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF6B00]"
                    >
                      {product.images?.[0] ? (
                        <img
                          src={getMediaUrl(product.images[0])}
                          alt={product.title}
                          loading="lazy"
                          className={`h-full w-full object-cover ${product.isSold ? 'opacity-60' : ''}`}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-6 w-6 text-[#667085]" aria-hidden="true" />
                        </div>
                      )}

                      {product.isSold && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-black px-1.5 py-0.5 text-[10px] font-bold text-white">Vendu</span>
                      )}

                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black px-1.5 py-0.5 text-[11px] font-bold text-white">
                        {product.priceUSD} $
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
