import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Truck, Percent, Receipt, ShieldCheck, Phone, MessageCircle } from 'lucide-react';
import { BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

// Numéro d'urgence / support modifiable facilement ici
const SUPPORT_PHONE = '+243990000000'; 
const WHATSAPP_NUMBER = '243990000000';

function getMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

function formatCDF(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

interface PaymentSummary {
  order: {
    id: string;
    items: { id: string; quantity: number; product: { id: string; title: string; images: string[] } }[];
  };
  totalWeightKg: number;
  subtotalCDF: number;
  subtotalUSD: number;
  deliveryFeeCDF: number;
  deliveryFeeUSD: number;
  commissionRate: number;
  commissionCDF: number;
  commissionUSD: number;
  grandTotalCDF: number;
  grandTotalUSD: number;
}

function SummaryRow({
  icon,
  label,
  cdf,
  usd,
  bold,
}: {
  icon?: React.ReactNode;
  label: string;
  cdf: number;
  usd?: number;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${bold ? 'text-base font-bold text-white' : 'text-sm text-neutral-300'}`}>
      <span className="flex items-center gap-2.5">
        {icon}
        <span className={bold ? 'font-semibold text-white' : ''}>{label}</span>
      </span>
      <span className={`text-right ${bold ? 'text-orange-500 text-lg font-extrabold' : 'font-medium'}`}>
        {formatCDF(cdf)} <span className="text-xs font-normal">CDF</span>
        {usd !== undefined && <span className="ml-1.5 text-xs text-neutral-500 font-normal">(~{usd.toFixed(2)} $)</span>}
      </span>
    </div>
  );
}

export default function PayPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    fetch(`${BASE_URL.replace(/\/+$/, '')}/orders/${orderId}/payment-summary`, { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Impossible de charger le récapitulatif.');
        return data.data as PaymentSummary;
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const item = summary?.order.items[0];
  const product = item?.product;

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-black/80 backdrop-blur-md px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)} 
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold leading-tight">Finaliser le paiement</h1>
            <p className="text-[11px] text-neutral-400">Tarifs de transport optimisés</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 pt-6 space-y-6">
        {loading && (
          <div className="py-20 text-center space-y-3">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <p className="text-xs text-neutral-400 animate-pulse">Chargement de votre récapitulatif…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center space-y-3 mt-10">
            <p className="text-sm font-semibold text-red-400">{error}</p>
            <Link to="/orders" className="inline-block rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-2 text-xs font-bold text-orange-400 hover:bg-neutral-800 transition-colors">
              Retour à mes commandes
            </Link>
          </div>
        )}

        {!loading && summary && product && (
          <>
            {/* Carte produit */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-neutral-800/80 bg-neutral-900/50 p-3.5 backdrop-blur-sm">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-800 border border-neutral-700/50">
                {product.images?.[0] && (
                  <img src={getMediaUrl(product.images[0])} alt={product.title} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-neutral-100">{product.title}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                  <span className="bg-neutral-800 px-2 py-0.5 rounded-md font-medium text-neutral-300">Qté : {item.quantity}</span>
                  <span>·</span>
                  <span className="text-emerald-400 font-medium">{summary.totalWeightKg} kg (Transport local)</span>
                </div>
              </div>
            </div>

            {/* Facture / Récapitulatif */}
            <div className="rounded-2xl border border-neutral-800/80 bg-neutral-900/40 p-4 backdrop-blur-sm divide-y divide-neutral-800/60">
              <SummaryRow label="Sous-total produit" cdf={summary.subtotalCDF} usd={summary.subtotalUSD} />
              <SummaryRow
                icon={<Truck className="h-4 w-4 text-orange-500" />}
                label="Frais de livraison (Abordable)"
                cdf={summary.deliveryFeeCDF}
                usd={summary.deliveryFeeUSD}
              />
              <SummaryRow
                icon={<Percent className="h-4 w-4 text-orange-500" />}
                label={`Commission plateforme (${Math.round(summary.commissionRate * 100)}%)`}
                cdf={summary.commissionCDF}
                usd={summary.commissionUSD}
              />
              <div className="pt-2">
                <SummaryRow
                  icon={<Receipt className="h-4 w-4 text-orange-500" />}
                  label="Total à payer"
                  cdf={summary.grandTotalCDF}
                  usd={summary.grandTotalUSD}
                  bold
                />
              </div>
            </div>

            {/* Section Adresse */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-neutral-300 ml-1">
                Adresse de livraison exacte <span className="text-orange-500">*</span>
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Commune, quartier, avenue, numéro..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-500 focus:bg-neutral-900 focus:outline-none transition-all shadow-inner"
              />
            </div>

            {/* Bouton de validation */}
            <div className="pt-2 space-y-3">
              <button
                type="button"
                disabled={!address.trim()}
                className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                onClick={() => alert('Récapitulatif validé. Intégration du paiement Mobile Money en cours.')}
              >
                Procéder au paiement
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500 pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Transactions sécurisées et adaptées aux prix locaux</span>
              </div>
            </div>

            {/* NOUVEAU : Bloc Coordonnées / Urgences / WhatsApp */}
            <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
              <p className="text-xs font-bold text-neutral-300 text-center">Besoin d'aide ou d'un arrangement pour le transport ?</p>
              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href={`tel:${SUPPORT_PHONE}`}
                  className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 border border-neutral-800 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 text-orange-500" />
                  <span>Appel urgence</span>
                </a>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=Bonjour,%20j'ai%20besoin%20d'aide%20pour%20ma%20commande%20sur%20la%20plateforme.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600/10 border border-emerald-500/30 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-600/20 transition-colors"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <span>WhatsApp</span>
                </a>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}