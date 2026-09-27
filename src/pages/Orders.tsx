import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
  product: OrderProduct;
}

interface SimilarProduct {
  id: string;
  title: string;
  images: string[];
  priceUSD: number;
  location: string | null;
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

// "23h 12m 05s" restant avant l'expiration du délai de 24h laissé au vendeur.
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

function OrderCard({ order }: { order: Order }) {
  const item = order.items[0];
  const product = item?.product;
  const countdown = useCountdown(order.status === 'AWAITING_SELLER_CONFIRMATION' ? order.expiresAt : null);

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
        </div>
        <div className="text-right">
          <span className="block text-sm font-bold text-orange-600">{order.totalUSD} $</span>
          <span
            className={`mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
              order.status === 'CONFIRMED' || order.status === 'DELIVERED'
                ? 'bg-emerald-600/20 text-emerald-400'
                : order.status === 'EXPIRED' || order.status === 'CANCELLED'
                ? 'bg-red-600/20 text-red-400'
                : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {STATUS_LABEL[order.status]}
          </span>
        </div>
      </div>

      {order.status === 'AWAITING_SELLER_CONFIRMATION' && countdown && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-orange-600/40 bg-orange-600/10 px-3 py-2 text-orange-400">
          <Clock className="h-4 w-4 shrink-0" />
          <p className="text-xs font-semibold">
            En attente de confirmation du vendeur — <span className="font-mono">{countdown}</span> restant
          </p>
        </div>
      )}

      {order.status === 'CONFIRMED' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p className="text-xs font-semibold">Le vendeur a confirmé : votre commande est en cours.</p>
        </div>
      )}

      {order.status === 'EXPIRED' && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2 text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-xs font-semibold">Ce produit n'est plus disponible.</p>
          </div>

          {!!order.similarProducts?.length && (
            <div>
              <p className="mb-2 text-xs font-semibold text-neutral-400">Produits similaires :</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {order.similarProducts.map((p) => (
                  <div key={p.id} className="w-28 shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-2">
                    <div className="mb-1 h-16 w-full overflow-hidden rounded bg-neutral-800">
                      {p.images?.[0] && (
                        <img src={getMediaUrl(p.images[0])} alt={p.title} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="truncate text-[11px] font-semibold">{p.title}</p>
                    <p className="text-[11px] font-bold text-orange-600">{p.priceUSD} $</p>
                  </div>
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
    // Recharge périodiquement : fait apparaître un statut "Indisponible" dès que le
    // serveur l'a détecté, sans que l'utilisateur ait à rafraîchir la page.
    const interval = setInterval(loadOrders, 30 * 1000);
    return () => clearInterval(interval);
  }, [loadOrders]);

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

        {!loading && !error && orders.map((order) => <OrderCard key={order.id} order={order} />)}
      </main>
    </div>
  );
}