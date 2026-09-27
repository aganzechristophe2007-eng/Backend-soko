import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Package, Tag, User as UserIcon } from 'lucide-react';
import { BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

function getMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">Profil</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading && <p className="py-8 text-center text-sm text-neutral-400">Chargement…</p>}

        {!loading && error && (
          <div className="rounded-xl border border-red-600/40 bg-red-600/10 p-4 text-center text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && profile && (
          <>
            <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-center">
              <span className="h-20 w-20 overflow-hidden rounded-full bg-[#c2410c] border-2 border-neutral-700">
                {profile.avatar ? (
                  <img src={getMediaUrl(profile.avatar)} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-full w-full p-4 text-white" />
                )}
              </span>
              <h2 className="text-lg font-bold">{profile.name}</h2>
              {profile.reviewCount > 0 && profile.averageRating !== null ? (
                <div className="flex items-center gap-1 text-sm font-semibold text-[#f97316]">
                  <Star className="h-4 w-4 fill-current" />
                  {profile.averageRating.toFixed(1)} <span className="text-neutral-400">({profile.reviewCount} avis)</span>
                </div>
              ) : (
                <p className="text-xs text-neutral-500">Pas encore d'avis</p>
              )}
            </div>

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
          </>
        )}
      </main>
    </div>
  );
}