import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Truck, Percent, Receipt } from 'lucide-react';
import { BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

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

/** Ligne "Libellé ......... Montant", sans encadré, juste du texte aligné. */
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
    <div className={`flex items-center justify-between gap-4 py-2.5 ${bold ? 'text-base font-extrabold text-white' : 'text-sm text-neutral-300'}`}>
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className={`text-right ${bold ? 'text-orange-500' : ''}`}>
        {formatCDF(cdf)} CDF
        {usd !== undefined && <span className="ml-1 text-xs text-neutral-500">(~{usd.toFixed(2)} $)</span>}
      </span>
    </div>
  );
}

export default function PayPage() {
  const { orderId } = useParams<{ orderId: string }>();
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
    <div className="min-h-screen bg-black text-white pb-16">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-black/95 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold">Paiement</h1>
      </header>

      <main className="mx-auto max-w-md px-4 py-6">
        {loading && <p className="py-10 text-center text-sm text-neutral-400">Chargement…</p>}

        {!loading && error && (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold text-red-400">{error}</p>
            <Link to="/orders" className="mt-3 inline-block text-sm font-bold text-orange-500">
              Retour à mes commandes
            </Link>
          </div>
        )}

        {!loading && summary && product && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-900">
                {product.images?.[0] && (
                  <img src={getMediaUrl(product.images[0])} alt={product.title} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{product.title}</p>
                <p className="text-xs text-neutral-500">
                  Quantité : {item.quantity} · Poids total : {summary.totalWeightKg} kg
                </p>
              </div>
            </div>

            <div className="mt-6 divide-y divide-neutral-900">
              <SummaryRow label="Sous-total produit" cdf={summary.subtotalCDF} usd={summary.subtotalUSD} />
              <SummaryRow
                icon={<Truck className="h-4 w-4 text-orange-500" />}
                label="Frais de livraison"
                cdf={summary.deliveryFeeCDF}
                usd={summary.deliveryFeeUSD}
              />
              <SummaryRow
                icon={<Percent className="h-4 w-4 text-orange-500" />}
                label={`Commission plateforme (${Math.round(summary.commissionRate * 100)}%)`}
                cdf={summary.commissionCDF}
                usd={summary.commissionUSD}
              />
              <div className="pt-3">
                <SummaryRow
                  icon={<Receipt className="h-4 w-4" />}
                  label="Total à payer"
                  cdf={summary.grandTotalCDF}
                  usd={summary.grandTotalUSD}
                  bold
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-1.5 block text-xs font-semibold text-neutral-400">Adresse de livraison</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Commune, quartier, avenue, numéro"
                rows={2}
                className="w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
              />
            </div>

            {/* Le calcul des frais est branché et fiable (calculé côté serveur). L'encaissement
                réel (mobile money / carte) n'est pas encore intégré ici — à connecter séparément
                dès que tu as choisi ton prestataire de paiement. */}
            <button
              type="button"
              disabled={!address.trim()}
              className="mt-6 w-full rounded-lg bg-orange-500 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
              onClick={() => alert('Récapitulatif prêt. Intégration du paiement (mobile money) à brancher ici.')}
            >
              Continuer vers le paiement
            </button>
          </>
        )}
      </main>
    </div>
  );
}