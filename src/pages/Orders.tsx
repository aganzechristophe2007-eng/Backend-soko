import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Check,
  Star,
  ShieldCheck,
  Lock,
  Smartphone,
  Truck,
  Phone,
  MessageCircle,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

// Numéros de support : définis VITE_SUPPORT_PHONE et VITE_WHATSAPP_NUMBER dans l'environnement du frontend.
// Aucun faux numéro par défaut : si une valeur manque, le contact correspondant n'est pas affiché.
const SUPPORT_PHONE = String(import.meta.env.VITE_SUPPORT_PHONE || '').replace(/[^\d+]/g, '');
const WHATSAPP_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');

type OrderStatus =
  | 'PENDING'
  | 'AWAITING_SELLER_CONFIRMATION'
  | 'CONFIRMED'
  | 'COURIER_VERIFIED'
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
  paidAt?: string | null;
  deliveryAddress?: string | null;
  items: OrderItem[];
  similarProducts?: SimilarProduct[];
  review?: OrderReview | null;
}

/* ---------- Libellés, couleurs et progression ---------- */
const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Enregistrée',
  AWAITING_SELLER_CONFIRMATION: 'Attente du vendeur',
  CONFIRMED: 'Vendeur confirmé',
  COURIER_VERIFIED: 'Vérifiée, à payer',
  SHIPPED: 'En livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  EXPIRED: 'Indisponible',
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: 'bg-neutral-600',
  AWAITING_SELLER_CONFIRMATION: 'bg-orange-600',
  CONFIRMED: 'bg-blue-600',
  COURIER_VERIFIED: 'bg-emerald-600',
  SHIPPED: 'bg-violet-600',
  DELIVERED: 'bg-emerald-700',
  CANCELLED: 'bg-red-600',
  EXPIRED: 'bg-neutral-600',
};

// Étape en cours pour chaque statut (les étapes précédentes sont terminées).
const STEPS = ['Commande', 'Vendeur', 'Vérification', 'Paiement', 'Livraison'];
const PROGRESS: Partial<Record<OrderStatus, number>> = {
  PENDING: 0,
  AWAITING_SELLER_CONFIRMATION: 1,
  CONFIRMED: 2,
  COURIER_VERIFIED: 3,
  SHIPPED: 4,
  DELIVERED: 5,
};

const PRE_PAYMENT: OrderStatus[] = ['PENDING', 'AWAITING_SELLER_CONFIRMATION', 'CONFIRMED', 'COURIER_VERIFIED'];

type Tone = 'wait' | 'ok' | 'bad' | 'neutral';
interface StatusInfo {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  text: string;
  note?: string;
}

const TONE_BG: Record<Tone, string> = {
  wait: 'bg-orange-500',
  ok: 'bg-emerald-500',
  bad: 'bg-red-500',
  neutral: 'bg-neutral-600',
};

// Ce que l'acheteur doit comprendre à chaque étape : où en est sa commande, ce qui va se passer,
// et surtout qu'aucun montant n'est débité avant la vérification de l'article.
function getStatusInfo(status: OrderStatus): StatusInfo {
  switch (status) {
    case 'PENDING':
      return {
        tone: 'neutral',
        icon: Package,
        title: 'Commande enregistrée',
        text: "Votre commande est bien enregistrée. Elle va être transmise au vendeur pour qu'il confirme la disponibilité de l'article.",
        note: "Aucun montant n'est débité à cette étape.",
      };
    case 'AWAITING_SELLER_CONFIRMATION':
      return {
        tone: 'wait',
        icon: Clock,
        title: 'Nous vérifions la disponibilité auprès du vendeur',
        text: "Le vendeur dispose de 12 heures pour confirmer que l'article est bien disponible. Sans réponse dans ce délai, la commande est clôturée automatiquement et nous vous proposons des produits similaires.",
        note: "Aucun montant n'est débité à cette étape.",
      };
    case 'CONFIRMED':
      return {
        tone: 'ok',
        icon: CheckCircle2,
        title: "Le vendeur a confirmé : l'article est disponible",
        text: "Un livreur CBFSOKO va récupérer l'article chez le vendeur et contrôler son état et sa conformité. Le paiement s'ouvre uniquement une fois ce contrôle terminé, et vous êtes notifié dès que c'est fait.",
        note: 'Vous ne payez rien avant cette vérification.',
      };
    case 'COURIER_VERIFIED':
      return {
        tone: 'ok',
        icon: ShieldCheck,
        title: 'Article vérifié par CBFSOKO : vous pouvez payer',
        text: "Notre livreur a contrôlé l'article. Avant de payer, vous verrez le détail complet : articles, livraison et commission. Vous confirmez ensuite avec votre code PIN Mobile Money, saisi uniquement sur votre téléphone.",
        note: 'Le montant est calculé et vérifié par nos serveurs.',
      };
    case 'SHIPPED':
      return {
        tone: 'ok',
        icon: Truck,
        title: 'Paiement confirmé : votre commande est en livraison',
        text: 'Nous avons bien reçu votre paiement. Votre commande est en cours de livraison et vous êtes notifié à chaque étape.',
        note: 'Gardez la référence de la commande en cas de question.',
      };
    case 'DELIVERED':
      return {
        tone: 'ok',
        icon: CheckCircle2,
        title: 'Commande livrée',
        text: 'Merci pour votre confiance. Votre avis sur le vendeur aide les autres acheteurs à choisir en toute sécurité.',
      };
    case 'CANCELLED':
      return {
        tone: 'bad',
        icon: XCircle,
        title: 'Commande annulée',
        text: "Cette commande a été annulée et n'est plus active. Pour toute question, contactez le support en indiquant la référence de la commande.",
      };
    case 'EXPIRED':
    default:
      return {
        tone: 'bad',
        icon: AlertTriangle,
        title: "Cet article n'est plus disponible",
        text: "Le vendeur n'a pas pu confirmer la disponibilité de l'article à temps. Découvrez ci-dessous des produits similaires.",
        note: "Aucun montant n'a été débité.",
      };
  }
}

const PROTECTIONS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ShieldCheck,
    title: 'Vérifié avant paiement',
    text: "Un livreur CBFSOKO contrôle l'article avant que vous ne payiez. Le paiement reste fermé tant que ce contrôle n'est pas fait.",
  },
  {
    icon: Lock,
    title: 'Montant contrôlé',
    text: 'Le total (articles, livraison, commission) est calculé par nos serveurs et ne peut pas être modifié depuis votre téléphone.',
  },
  {
    icon: Smartphone,
    title: 'Paiement Mobile Money',
    text: 'Vous validez avec votre code PIN sur votre téléphone. CBFSOKO ne reçoit jamais votre code PIN et ne conserve votre numéro que sous forme masquée.',
  },
  {
    icon: Truck,
    title: 'Suivi et notifications',
    text: 'Vous êtes informé aux étapes clés : confirmation du vendeur, vérification, paiement et livraison.',
  },
];

const HOW_IT_WORKS: { title: string; text: string }[] = [
  { title: 'Vous commandez', text: "Votre demande est enregistrée. Aucun paiement n'est demandé à ce stade." },
  { title: 'Le vendeur confirme', text: "Il dispose de 12 heures pour confirmer que l'article est disponible." },
  { title: 'CBFSOKO vérifie', text: "Un livreur récupère l'article et contrôle son état et sa conformité." },
  { title: 'Vous payez', text: 'Le paiement s\'ouvre uniquement après la vérification, par Airtel Money, Orange Money, M-Pesa ou Afrimoney.' },
  { title: 'Vous êtes livré', text: 'Vous suivez la livraison, puis vous pouvez noter le vendeur.' },
];

/* ---------- Utilitaires ---------- */
function getMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

const fmtUSD = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const fmtCDF = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} CDF`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const shortRef = (id: string) => id.slice(-8).toUpperCase();
const whatsappHref = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

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

/* ---------- Note du vendeur ---------- */
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
      <div className="mt-4 rounded-xl bg-neutral-800 p-4">
        <p className="mb-1.5 text-xs font-semibold text-neutral-300">Votre note pour ce vendeur</p>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-4 w-4 ${n <= order.review!.rating ? 'fill-orange-500 text-orange-500' : 'text-neutral-600'}`}
            />
          ))}
        </div>
        {order.review.comment && <p className="mt-2 text-xs text-neutral-300">{order.review.comment}</p>}
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
    <div className="mt-4 rounded-xl bg-neutral-800 p-4">
      <p className="mb-2 text-xs font-semibold text-neutral-200">Noter ce vendeur</p>
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
                n <= (hoverRating || rating) ? 'fill-orange-500 text-orange-500' : 'text-neutral-600'
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
        className="mt-3 w-full resize-none rounded-lg bg-neutral-900 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:bg-neutral-950 focus:outline-none"
      />
      {error && <p className="mt-1.5 text-xs font-semibold text-red-400">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-3 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
      >
        {submitting ? 'Envoi…' : 'Envoyer ma note'}
      </button>
    </div>
  );
}

/* ---------- Suivi d'étapes ---------- */
function ProgressSteps({ current }: { current: number }) {
  return (
    <ol className="mt-5 flex items-start" aria-label="Progression de la commande">
      {STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li
            key={label}
            className="relative flex flex-1 flex-col items-center text-center"
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute left-0 right-1/2 top-3.5 h-0.5 -translate-y-1/2 ${i <= current ? 'bg-emerald-500' : 'bg-neutral-700'}`}
              />
            )}
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute left-1/2 right-0 top-3.5 h-0.5 -translate-y-1/2 ${i < current ? 'bg-emerald-500' : 'bg-neutral-700'}`}
              />
            )}
            <span
              className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                state === 'done'
                  ? 'bg-emerald-500 text-white'
                  : state === 'current'
                  ? 'bg-orange-500 text-white'
                  : 'bg-neutral-700 text-neutral-400'
              }`}
            >
              {state === 'done' ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={`mt-1.5 text-[10px] leading-tight sm:text-xs ${
                state === 'todo' ? 'text-neutral-500' : state === 'current' ? 'font-bold text-white' : 'font-semibold text-neutral-300'
              }`}
            >
              {label}
              <span className="sr-only">{state === 'done' ? ' (terminée)' : state === 'current' ? ' (en cours)' : ' (à venir)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Carte d'une commande ---------- */
function OrderCard({ order, onOrderUpdate }: { order: Order; onOrderUpdate: (id: string, patch: Partial<Order>) => void }) {
  const item = order.items[0];
  const product = item?.product;
  const countdown = useCountdown(order.status === 'AWAITING_SELLER_CONFIRMATION' ? order.expiresAt : null);

  if (!product) return null;

  const info = getStatusInfo(order.status);
  const InfoIcon = info.icon;
  const progress = PROGRESS[order.status];
  const ref = shortRef(order.id);
  const primary = order.totalUSD > 0 ? fmtUSD(order.totalUSD) : fmtCDF(order.totalCDF);
  const secondary = order.totalUSD > 0 && order.totalCDF > 0 ? fmtCDF(order.totalCDF) : null;
  const extraItems = order.items.length - 1;

  return (
    <article className="rounded-2xl bg-neutral-900 p-5" aria-label={`Commande ${ref} : ${product.title}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-400">
          Réf. <span className="font-mono font-semibold text-neutral-200">{ref}</span>
        </p>
        <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold text-white ${STATUS_BADGE[order.status]}`}>
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-3.5">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-800">
          {product.images?.[0] && (
            <img src={getMediaUrl(product.images[0])} alt={product.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-white">{product.title}</h2>
          <p className="mt-0.5 truncate text-xs text-neutral-400">Vendeur : {product.seller?.name}</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Quantité : <span className="font-semibold text-neutral-200">{item.quantity}</span>
            {extraItems > 0 && <span> · +{extraItems} autre{extraItems > 1 ? 's' : ''} article{extraItems > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="block text-[11px] text-neutral-400">Montant des articles</span>
          <span className="block text-base font-extrabold text-orange-500">{primary}</span>
          {secondary && <span className="block text-[11px] text-neutral-400">{secondary}</span>}
        </div>
      </div>

      {PRE_PAYMENT.includes(order.status) && (
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
          Les frais de livraison et la commission de la plateforme sont détaillés avant votre paiement : aucune surprise.
        </p>
      )}

      {progress !== undefined && <ProgressSteps current={progress} />}

      <div className="mt-5 flex gap-3 rounded-xl bg-neutral-800 p-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${TONE_BG[info.tone]}`}>
          <InfoIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-bold text-white">{info.title}</h3>
          <p className="text-xs leading-relaxed text-neutral-300">{info.text}</p>
          {order.status === 'AWAITING_SELLER_CONFIRMATION' && countdown && (
            <div className="flex items-center justify-between rounded-lg bg-neutral-900 px-3 py-2">
              <span className="text-[11px] font-semibold text-neutral-300">Temps restant pour le vendeur</span>
              <span className="font-mono text-sm font-bold text-orange-400">{countdown}</span>
            </div>
          )}
          {info.note && (
            <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{info.note}</span>
            </p>
          )}
        </div>
      </div>

      {order.status === 'COURIER_VERIFIED' && (
        <div className="mt-4 space-y-2">
          <Link
            to={`/pay/${order.id}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-700"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            Payer maintenant
          </Link>
          <p className="text-center text-[11px] text-neutral-400">
            Paiement par Airtel Money, Orange Money, M-Pesa ou Afrimoney. Vous confirmez sur votre téléphone.
          </p>
        </div>
      )}

      {order.status === 'DELIVERED' && (
        <SellerRatingBlock
          order={order}
          productId={product.id}
          onSubmitted={(review) => onOrderUpdate(order.id, { review })}
        />
      )}

      {order.status === 'EXPIRED' && !!order.similarProducts?.length && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-neutral-300">Produits similaires</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {order.similarProducts.map((p) => (
              <Link key={p.id} to={`/products/${p.id}`} className="w-28 shrink-0">
                <div className="mb-1.5 h-20 w-full overflow-hidden rounded-lg bg-neutral-800">
                  {p.images?.[0] && (
                    <img src={getMediaUrl(p.images[0])} alt={p.title} className="h-full w-full object-cover" />
                  )}
                </div>
                <p className="truncate text-[11px] font-semibold text-neutral-100">{p.title}</p>
                <p className="text-[11px] font-bold text-orange-500">{fmtUSD(p.priceUSD)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-neutral-400">Commande passée le</dt>
          <dd className="mt-0.5 font-semibold text-neutral-100">{fmtDate(order.createdAt)}</dd>
        </div>
        {order.paidAt && (
          <div>
            <dt className="text-neutral-400">Paiement confirmé le</dt>
            <dd className="mt-0.5 font-semibold text-neutral-100">{fmtDate(order.paidAt)}</dd>
          </div>
        )}
        {order.deliveryAddress && (order.status === 'SHIPPED' || order.status === 'DELIVERED') && (
          <div className="col-span-2">
            <dt className="text-neutral-400">Adresse de livraison</dt>
            <dd className="mt-0.5 break-words font-semibold text-neutral-100">{order.deliveryAddress}</dd>
          </div>
        )}
      </dl>

      {WHATSAPP_NUMBER && (
        <a
          href={whatsappHref(`Bonjour, j'ai une question sur ma commande ${ref}.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Une question sur cette commande ? Écrivez-nous
        </a>
      )}
    </article>
  );
}

/* ---------- Page ---------- */
export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadOrders = useCallback(async () => {
    let message = 'Impossible de charger vos commandes pour le moment.';
    try {
      const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/orders/mine`, { credentials: 'include' });
      if (res.status === 401) {
        message = 'Votre session a expiré. Reconnectez-vous pour consulter vos commandes.';
        throw new Error(message);
      }
      if (!res.ok) throw new Error(message);
      const { data } = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      setError('');
      setUpdatedAt(new Date());
    } catch (err) {
      console.error('Erreur chargement commandes', err);
      setError(message);
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

  const readyToPay = orders.filter((o) => o.status === 'COURIER_VERIFIED').length;
  const hasOrders = orders.length > 0;

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-neutral-100">
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-neutral-900 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Retour à l'accueil"
          className="rounded-lg p-2 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-bold leading-tight">Mes commandes</h1>
          <p className="text-[11px] text-neutral-400">Suivi et paiement sécurisés par CBFSOKO</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6" aria-busy={loading}>
        {loading && !hasOrders && (
          <div className="space-y-4" role="status">
            <span className="sr-only">Chargement de vos commandes</span>
            {[0, 1].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-neutral-900" />
            ))}
          </div>
        )}

        {!loading && error && !hasOrders && (
          <div className="space-y-4 rounded-2xl bg-neutral-900 p-6 text-center" role="alert">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
            <p className="text-sm font-semibold text-neutral-100">{error}</p>
            <p className="text-xs text-neutral-400">Vos commandes et vos paiements ne sont pas affectés.</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                loadOrders();
              }}
              className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-700"
            >
              Réessayer
            </button>
          </div>
        )}

        {error && hasOrders && (
          <p role="alert" className="rounded-xl bg-orange-600 px-4 py-3 text-xs font-semibold text-white">
            Actualisation impossible pour le moment. Les informations affichées peuvent ne pas être à jour.
          </p>
        )}

        {!loading && !error && !hasOrders && (
          <div className="rounded-2xl bg-neutral-900 px-6 py-14 text-center">
            <Package className="mx-auto mb-4 h-12 w-12 text-neutral-600" aria-hidden="true" />
            <p className="text-sm font-bold text-neutral-100">Aucune commande pour le moment</p>
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-neutral-400">
              Quand vous commanderez, vous pourrez suivre chaque étape ici. Vous ne payez qu'après la vérification de l'article.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-6 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-700"
            >
              Découvrir les produits
            </button>
          </div>
        )}

        {hasOrders && (
          <>
            {readyToPay > 0 && (
              <div className="flex items-start gap-3 rounded-2xl bg-emerald-600 p-4 text-white">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold">
                    {readyToPay === 1
                      ? '1 commande vérifiée est prête à être payée'
                      : `${readyToPay} commandes vérifiées sont prêtes à être payées`}
                  </p>
                  <p className="mt-0.5 text-xs">Le paiement est ouvert, car notre livreur a contrôlé l'article.</p>
                </div>
              </div>
            )}

            <section aria-labelledby="protection-title" className="rounded-2xl bg-neutral-900 p-5">
              <h2 id="protection-title" className="text-sm font-bold text-white">
                Votre protection sur CBFSOKO
              </h2>
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {PROTECTIONS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <li key={p.title} className="flex gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-white">{p.title}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">{p.text}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold text-neutral-300">
                {orders.length} commande{orders.length > 1 ? 's' : ''}
              </p>
              {updatedAt && (
                <p className="text-[11px] text-neutral-500">
                  Mis à jour à {updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · actualisation automatique
                </p>
              )}
            </div>

            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onOrderUpdate={handleOrderUpdate} />
            ))}

            <section aria-labelledby="how-title" className="rounded-2xl bg-neutral-900 p-5">
              <h2 id="how-title" className="text-sm font-bold text-white">
                Comment fonctionne votre commande
              </h2>
              <ol className="mt-4 space-y-4">
                {HOW_IT_WORKS.map((s, i) => (
                  <li key={s.title} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-white">{s.title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {(SUPPORT_PHONE || WHATSAPP_NUMBER) && (
              <section aria-labelledby="help-title" className="rounded-2xl bg-neutral-900 p-5">
                <h2 id="help-title" className="text-sm font-bold text-white">
                  Besoin d'aide ?
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                  Notre équipe répond à vos questions sur une commande, un paiement ou une livraison. Indiquez la référence de
                  la commande pour un traitement plus rapide.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {SUPPORT_PHONE && (
                    <a
                      href={`tel:${SUPPORT_PHONE}`}
                      className="flex items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-xs font-bold text-white transition-colors hover:bg-neutral-700"
                    >
                      <Phone className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      Appeler le support
                    </a>
                  )}
                  {WHATSAPP_NUMBER && (
                    <a
                      href={whatsappHref("Bonjour, j'ai besoin d'aide pour une commande.")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      WhatsApp
                    </a>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}