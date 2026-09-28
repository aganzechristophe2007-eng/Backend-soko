import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Clock, CheckCircle2, Camera, X, Loader2 } from 'lucide-react';
import { BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

type OrderStatus = 'CONFIRMED' | 'COURIER_VERIFIED' | 'SHIPPED' | 'DELIVERED';

interface OrderProduct {
  id: string;
  title: string;
  images: string[];
  priceUSD: number;
  priceCDF: number;
  seller: { id: string; name: string; avatar: string | null };
}

interface OrderItem {
  id: string;
  quantity: number;
  product: OrderProduct;
}

interface CourierOrder {
  id: string;
  status: OrderStatus;
  totalUSD: number;
  totalCDF: number;
  deliveryAddress: string | null;
  courierAssignedAt: string | null;
  verifiedAt: string | null;
  items: OrderItem[];
  buyer: { id: string; name: string; avatar: string | null };
}

function getMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

// Formulaire de vérification pour une collecte assignée. Note et photos sont un draft local
// indépendant de la liste chargée depuis l'API, pour ne pas être écrasé par le rafraîchissement
// automatique pendant que le livreur saisit ses informations.
function VerificationForm({
  order,
  onCancel,
  onVerified,
}: {
  order: CourierOrder;
  onCancel: () => void;
  onVerified: (order: CourierOrder) => void;
}) {
  const [note, setNote] = useState('');
  const [photosInput, setPhotosInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const verificationPhotos = photosInput
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/orders/${order.id}/verify`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationNote: note.trim() || undefined,
          verificationPhotos: verificationPhotos.length ? verificationPhotos : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Impossible de valider la vérification.');
      }
      onVerified(data.order as CourierOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de valider la vérification.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 space-y-2.5 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-neutral-400">
          Remarque sur l'état de l'article (optionnel)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          placeholder="Conforme à la description, emballage correct…"
          rows={2}
          className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400">
          <Camera className="h-3.5 w-3.5" /> Photos de contrôle (liens, séparés par une virgule)
        </label>
        <input
          value={photosInput}
          onChange={(e) => setPhotosInput(e.target.value)}
          placeholder="https://…, https://…"
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-lg border border-neutral-700 px-4 py-2 text-xs font-bold text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {submitting ? 'Validation…' : 'Vérifié par CBFSOKO'}
        </button>
      </div>
    </div>
  );
}

function PendingCard({ order, onVerified }: { order: CourierOrder; onVerified: (order: CourierOrder) => void }) {
  const item = order.items[0];
  const product = item?.product;
  const [formOpen, setFormOpen] = useState(false);

  if (!product) return null;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
          {product.images?.[0] && (
            <img src={getMediaUrl(product.images[0])} alt={product.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{product.title}</h2>
          <p className="truncate text-xs text-neutral-400">Vendeur : {product.seller?.name}</p>
          <p className="truncate text-xs text-neutral-400">Acheteur : {order.buyer?.name}</p>
        </div>
        <span className="shrink-0 text-sm font-bold text-orange-500">{order.totalUSD} $</span>
      </div>

      <div className="mt-3 flex items-start gap-2 text-neutral-300">
        <Package className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
        <p className="text-xs">
          {order.deliveryAddress?.trim()
            ? order.deliveryAddress
            : "Adresse non renseignée — à confirmer avec l'acheteur avant collecte."}
        </p>
      </div>

      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mt-3 w-full rounded-lg bg-orange-500 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-orange-600"
        >
          Vérifier la collecte
        </button>
      ) : (
        <VerificationForm order={order} onCancel={() => setFormOpen(false)} onVerified={onVerified} />
      )}
    </div>
  );
}

function DoneCard({ order }: { order: CourierOrder }) {
  const item = order.items[0];
  const product = item?.product;
  if (!product) return null;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 opacity-80">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
          {product.images?.[0] && (
            <img src={getMediaUrl(product.images[0])} alt={product.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{product.title}</h2>
          <p className="truncate text-xs text-neutral-500">Acheteur : {order.buyer?.name}</p>
        </div>
        <div className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-[11px] font-bold">Vérifié</span>
        </div>
      </div>
    </div>
  );
}

export default function CourierQueue() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/orders/courier/mine`, { credentials: 'include' });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error('Impossible de charger vos collectes.');
      const { data } = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erreur chargement collectes', err);
      setError('Impossible de charger vos collectes pour le moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30 * 1000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleVerified = useCallback((updated: CourierOrder) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }, []);

  const { pending, done } = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'CONFIRMED');
    const done = orders
      .filter((o) => o.status !== 'CONFIRMED')
      .sort((a, b) => new Date(b.verifiedAt ?? 0).getTime() - new Date(a.verifiedAt ?? 0).getTime())
      .slice(0, 10);
    return { pending, done };
  }, [orders]);

  if (forbidden) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-center text-neutral-300">
        <div>
          <X className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="text-sm font-semibold">Cet espace est réservé aux livreurs CBFSOKO.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-neutral-100">
      <header className="sticky top-0 z-40 flex items-center space-x-3 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3">
        <button
          onClick={() => navigate('/')}
          className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold">Espace Livreur</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {loading && <p className="py-8 text-center text-sm text-neutral-400">Chargement…</p>}

        {!loading && error && (
          <div className="rounded-xl border border-red-600/40 bg-red-600/10 p-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-400" />
                <h2 className="text-sm font-bold text-orange-400">À collecter et vérifier ({pending.length})</h2>
              </div>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 py-10 text-center text-neutral-500">
                  <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p className="text-sm">Aucune collecte assignée pour le moment.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pending.map((order) => (
                    <PendingCard key={order.id} order={order} onVerified={handleVerified} />
                  ))}
                </div>
              )}
            </section>

            {done.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-bold text-neutral-400">Traitées récemment</h2>
                <div className="space-y-2">
                  {done.map((order) => (
                    <DoneCard key={order.id} order={order} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}