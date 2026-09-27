import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Package, Clock, AlertTriangle, CheckCircle2, Star, Minus, Plus } from 'lucide-react';
import { BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

type OrderStatus =
  | 'PENDING'
  | 'AWAITING_SELLER_CONFIRMATION'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'EXPIRED';

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

interface SimilarProduct {
  id: string;
  title: string;
  images: string[];
  priceUSD: number;
  location: string | null;
}

interface OrderReview {
  rating: number;
  comment: string | null;
}

interface Order {
  id: string;
  status: OrderStatus;
  totalUSD: number;
  totalCDF: number;
  expiresAt: string | null;
  createdAt: string;
  items: OrderItem[];
  similarProducts?: SimilarProduct[];
  review?: OrderReview | null;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  AWAITING_SELLER_CONFIRMATION: 'Vérification en cours',
  CONFIRMED: 'Confirmée',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  EXPIRED: 'Indisponible',
};

function getMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

function useCountdown(expiresAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return useMemo(() => {
    if (!expiresAt) return null;
    const remainingMs = new Date(expiresAt).getTime() - now;
    if (remainingMs <= 0) return '00:00:00';
    const totalSeconds = Math.floor(remainingMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [expiresAt, now]);
}

function SellerRatingBlock({
  order,
  productId,
  onSubmitted,
}: {
  order: Order;
  productId: string;
  onSubmitted: (review: OrderReview) => void;
}) {
  const [hoverRating, setHoverRating] = useState(0);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (order.review) {
    return (
      <div className="mt-3">
        <p className="mb-1 text-xs font-semibold text-neutral-400">Votre note pour ce vendeur</p>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-4 w-4 ${n <= order.review!.rating ? 'fill-orange-500 text-orange-500' : 'text-neutral-700'}`}
            />
          ))}
        </div>
        {order.review.comment && <p className="mt-1.5 text-xs text-neutral-300">{order.review.comment}</p>}
      </div>
    );
  }

  const submit = async () => {
    if (rating < 1) {
      setError('Choisissez une note de 1 à 5 étoiles.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/products/${productId}/reviews`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, rating, comment: comment.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || "Impossible d'enregistrer votre note.");
      }
      onSubmitted({ rating, comment: comment.trim() || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer votre note.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-semibold text-neutral-300">Noter ce vendeur</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Note sur 5 étoiles">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
            className="p-0.5"
          >
            <Star
              className={`h-6 w-6 transition-colors ${
                n <= (hoverRating || rating) ? 'fill-orange-500 text-orange-500' : 'text-neutral-700'
              }`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 500))}
        placeholder="Un commentaire (optionnel)"
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
      />
      {error && <p className="mt-1.5 text-xs font-semibold text-red-400">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-2 w-full rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
      >
        {submitting ? 'Envoi…' : 'Envoyer ma note'}
      </button>
    </div>
  );
}

function OrderCard({ order, onOrderUpdate }: { order: Order; onOrderUpdate: (id: string, patch: Partial<Order>) => void }) {
  const item = order.items[0];
  const product = item?.product;
  const countdown = useCountdown(order.status === 'AWAITING_SELLER_CONFIRMATION' ? order.expiresAt : null);
  const [updatingQty, setUpdatingQty] = useState(false);

  if (!product) return null;

  // Fonction pour modifier la quantité (modifiable uniquement si la commande est en attente ou avant paiement)
  const handleQuantityChange = async (newQuantity: number) => {
    if (newQuantity < 1 || updatingQty) return;
    setUpdatingQty(true);
    try {
      const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/orders/${order.id}/quantity`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: newQuantity }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Impossible de modifier la quantité.');
      }
      // Met à jour localement les données de la commande (quantité et totaux recalculés par le serveur si renvoyés)
      onOrderUpdate(order.id, {
        totalUSD: data.data?.totalUSD ?? order.totalUSD,
        totalCDF: data.data?.totalCDF ?? order.totalCDF,
        items: order.items.map((it, idx) => (idx === 0 ? { ...it, quantity: newQuantity } : it)),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la modification de la quantité.');
    } finally {
      setUpdatingQty(false);
    }
  };

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
          
          {/* Sélecteur de quantité (Actif si la commande n'est pas encore validée/expédiée) */}
          {(order.status === 'PENDING' || order.status === 'AWAITING_SELLER_CONFIRMATION' || order.status === 'CONFIRMED') && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-neutral-400">Quantité :</span>
              <div className="flex items-center rounded-lg border border-neutral-700 bg-neutral-800/60 overflow-hidden">
                <button
                  type="button"
                  disabled={item.quantity <= 1 || updatingQty}
                  onClick={() => handleQuantityChange(item.quantity - 1)}
                  className="px-2 py-0.5 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="px-2.5 text-xs font-bold text-white">{item.quantity}</span>
                <button
                  type="button"
                  disabled={updatingQty}
                  onClick={() => handleQuantityChange(item.quantity + 1)}
                  className="px-2 py-0.5 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-right">
          <span className="block text-sm font-bold text-orange-500">{order.totalUSD} $</span>
          <span
            className={`mt-1 block text-[11px] font-bold ${
              order.status === 'CONFIRMED' || order.status === 'DELIVERED'
                ? 'text-emerald-400'
                : order.status === 'EXPIRED' || order.status === 'CANCELLED'
                ? 'text-red-400'
                : 'text-neutral-400'
            }`}
          >
            {STATUS_LABEL[order.status]}
          </span>
        </div>
      </div>

      {order.status === 'AWAITING_SELLER_CONFIRMATION' && countdown && (
        <div className="mt-3 flex items-center gap-2 text-orange-400">
          <Clock className="h-4 w-4 shrink-0" />
          <p className="text-xs font-semibold">
            En attente de confirmation du vendeur — <span className="font-mono">{countdown}</span> restant
          </p>
        </div>
      )}

      {order.status === 'CONFIRMED' && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <p className="text-xs font-semibold">Le vendeur a confirmé : votre commande est en cours.</p>
          </div>
          <Link
            to={`/pay/${order.id}`}
            className="block w-full rounded-lg bg-orange-500 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-orange-600"
          >
            Payer maintenant
          </Link>
        </div>
      )}

      {order.status === 'DELIVERED' && (
        <SellerRatingBlock
          order={order}
          productId={product.id}
          onSubmitted={(review) => onOrderUpdate(order.id, { review })}
        />
      )}

      {order.status === 'EXPIRED' && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-xs font-semibold">Ce produit n'est plus disponible.</p>
          </div>

          {!!order.similarProducts?.length && (
            <div>
              <p className="mb-2 text-xs font-semibold text-neutral-400">Produits similaires :</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {order.similarProducts.map((p) => (
                  <Link key={p.id} to={`/products/${p.id}`} className="w-28 shrink-0">
                    <div className="mb-1 h-16 w-full overflow-hidden rounded bg-neutral-800">
                      {p.images?.[0] && (
                        <img src={getMediaUrl(p.images[0])} alt={p.title} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="truncate text-[11px] font-semibold">{p.title}</p>
                    <p className="text-[11px] font-bold text-orange-500">{p.priceUSD} $</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/orders/mine`, { credentials: 'include' });
      if (!res.ok) throw new Error('Impossible de charger vos commandes.');
      const { data } = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erreur chargement commandes', err);
      setError('Impossible de charger vos commandes pour le moment.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30 * 1000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleOrderUpdate = useCallback((id: string, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">Mes Commandes</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {loading && <p className="py-8 text-center text-sm text-neutral-400">Chargement…</p>}

        {!loading && error && (
          <div className="rounded-xl border border-red-600/40 bg-red-600/10 p-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-16 border border-neutral-800 rounded-xl bg-neutral-900 text-neutral-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Aucune commande enregistrée.</p>
          </div>
        )}

        {!loading &&
          !error &&
          orders.map((order) => <OrderCard key={order.id} order={order} onOrderUpdate={handleOrderUpdate} />)}
      </main>
    </div>
  );
}