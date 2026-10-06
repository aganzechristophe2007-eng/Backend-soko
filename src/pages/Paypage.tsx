import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Truck, Percent, Receipt, ShieldCheck, Phone, MessageCircle, CheckCircle2, XCircle, Wallet as WalletIcon } from 'lucide-react';
import { apiFetch, BASE_URL } from '../api/client';

const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '');

// Numéros de support : définis VITE_SUPPORT_PHONE et VITE_WHATSAPP_NUMBER dans l'environnement du frontend.
// Aucun faux numéro par défaut : si une valeur manque, le bouton correspondant n'est pas affiché.
const SUPPORT_PHONE = String(import.meta.env.VITE_SUPPORT_PHONE || '').replace(/[^\d+]/g, '');
const WHATSAPP_NUMBER = String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');

const POLL_INTERVAL_MS = 3000;

type Currency = 'CDF' | 'USD';
type PayMethod = 'mobile' | 'wallet';
type View = 'loading' | 'form' | 'waiting' | 'success' | 'failed' | 'error';

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

interface PaymentDto {
  id: string;
  orderId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  amount: number;
  currency: Currency;
  feeAmount: number | null;
  totalCharged: number | null;
  network: string | null;
  phoneMasked: string;
  failureCode: string | null;
}

function getMediaUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

function formatCDF(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

function formatMoney(n: number, currency: Currency): string {
  return currency === 'CDF' ? `${formatCDF(n)} CDF` : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

// Même règle que le serveur (qui reste seul juge) : 10 chiffres, ex. 0997654321.
function normalizePhone(input: string): string | null {
  let v = input.replace(/[\s().-]/g, '');
  if (v.startsWith('+')) v = v.slice(1);
  if (v.startsWith('00243')) v = v.slice(2);
  if (!/^\d+$/.test(v)) return null;
  if (/^243\d{9}$/.test(v)) v = `0${v.slice(3)}`;
  else if (/^\d{9}$/.test(v)) v = `0${v}`;
  return /^0\d{9}$/.test(v) ? v : null;
}

function failureMessage(p: PaymentDto | null): string {
  switch (p?.failureCode) {
    case 'REFUSED':
      return 'Le paiement a été refusé. Vérifiez votre numéro Mobile Money (Airtel Money, Orange Money, M-Pesa ou Afrimoney), puis réessayez.';
    case 'DECLINED':
      return "Le paiement n'a pas été validé (refusé, annulé ou solde insuffisant). Vous pouvez réessayer.";
    case 'EXPIRED':
      return 'Le délai de confirmation est dépassé. Réessayez et validez rapidement sur votre téléphone.';
    case 'NOT_FOUND':
      return "La demande de paiement n'a pas pu être envoyée. Vous pouvez réessayer.";
    case 'AMOUNT_MISMATCH':
    case 'ORDER_NOT_PAYABLE':
      return 'Une vérification manuelle est nécessaire. Contactez le support en indiquant la référence ci-dessous.';
    default:
      return "Le paiement n'a pas abouti. Vous pouvez réessayer.";
  }
}

function SummaryRow({
  icon,
  label,
  value,
  bold,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${bold ? 'text-base font-bold text-white' : 'text-sm text-neutral-300'}`}>
      <span className="flex items-center gap-2.5">
        {icon}
        <span className={bold ? 'font-semibold text-white' : ''}>{label}</span>
      </span>
      <span className={`text-right ${bold ? 'text-lg font-extrabold text-orange-500' : 'font-medium'}`}>{value}</span>
    </div>
  );
}

export default function PayPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('loading');
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [payment, setPayment] = useState<PaymentDto | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [currency, setCurrency] = useState<Currency>('CDF');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [pollWarning, setPollWarning] = useState(false);
  const [method, setMethod] = useState<PayMethod>('mobile');
  const [wallet, setWallet] = useState<{ balanceCDF: number; balanceUSD: number } | null>(null);

  // Chargement : si un paiement existe déjà pour cette commande (réussi ou en cours), on le reprend ;
  // sinon on affiche le récapitulatif calculé par le serveur.
  const load = useCallback(async () => {
    if (!orderId) return;
    setView('loading');
    setErrorMsg('');
    try {
      const latest = await apiFetch(`/payments/orders/${orderId}/latest`);
      const p = (latest?.data ?? null) as PaymentDto | null;
      if (p && p.status === 'SUCCESS') {
        setPayment(p);
        setView('success');
        return;
      }
      if (p && p.status === 'PENDING') {
        setPayment(p);
        setView('waiting');
        return;
      }
    } catch {
      // on continue : le récapitulatif indiquera si la commande est payable
    }
    try {
      const res = await apiFetch(`/orders/${orderId}/payment-summary`);
      setSummary(res.data as PaymentSummary);
      try {
        const w = await apiFetch('/wallet');
        setWallet({ balanceCDF: w.data.balanceCDF, balanceUSD: w.data.balanceUSD });
      } catch {
        setWallet(null); // le paiement Mobile Money reste possible
      }
      setView('form');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Impossible de charger le récapitulatif.');
      setView('error');
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Suivi du paiement : le serveur interroge WonyaPay à chaque appel (le callback n'est jamais cru seul).
  const pendingId = view === 'waiting' ? payment?.id : undefined;
  useEffect(() => {
    if (!pendingId) return;
    let stopped = false;
    let failures = 0;

    const tick = async () => {
      try {
        const res = await apiFetch(`/payments/${pendingId}`);
        if (stopped) return;
        failures = 0;
        setPollWarning(false);
        const p = res.data as PaymentDto;
        setPayment(p);
        if (p.status === 'SUCCESS') setView('success');
        else if (p.status === 'FAILED' || p.status === 'EXPIRED') setView('failed');
      } catch {
        failures += 1;
        if (failures >= 5 && !stopped) setPollWarning(true);
      }
    };

    tick();
    const timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pendingId]);

  const submit = async () => {
    if (submitting || !orderId) return;
    const normalized = method === 'mobile' ? normalizePhone(phone) : '';
    if (method === 'mobile' && !normalized) {
      setFormError('Numéro Mobile Money invalide (10 chiffres, ex. 0997654321).');
      return;
    }
    if (address.trim().length < 10) {
      setFormError('Indiquez une adresse de livraison précise (commune, quartier, avenue, numéro).');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      if (method === 'wallet') {
        // Paiement par le solde du portefeuille : confirmé immédiatement par le serveur.
        const r = await apiFetch(`/wallet/pay-order/${orderId}`, {
          method: 'POST',
          body: JSON.stringify({ currency, address: address.trim() }),
        });
        setPayment(r.data as PaymentDto);
        setView('success');
        return;
      }
      const res = await apiFetch(`/payments/orders/${orderId}/initiate`, {
        method: 'POST',
        body: JSON.stringify({ currency, phone: normalized, address: address.trim() }),
      });
      setPayment(res.data as PaymentDto);
      setView('waiting');
    } catch (err: any) {
      if (err?.data?.code === 'PAYMENT_IN_PROGRESS' && err?.data?.paymentId) {
        try {
          const r = await apiFetch(`/payments/${err.data.paymentId}`);
          setPayment(r.data as PaymentDto);
          setView('waiting');
          return;
        } catch {
          // on affiche le message ci-dessous
        }
      }
      setFormError(err?.message || 'Impossible de lancer le paiement.');
    } finally {
      setSubmitting(false);
    }
  };

  const item = summary?.order.items[0];
  const product = item?.product;
  const selectedAmount = summary ? (currency === 'CDF' ? summary.grandTotalCDF : summary.grandTotalUSD) : 0;
  const walletBalance = wallet ? (currency === 'CDF' ? wallet.balanceCDF : wallet.balanceUSD) : 0;
  const walletEnough = !!wallet && walletBalance >= selectedAmount;
  const needsSupport = payment?.failureCode === 'AMOUNT_MISMATCH' || payment?.failureCode === 'ORDER_NOT_PAYABLE';

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-white">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm font-bold leading-tight">Finaliser le paiement</h1>
            <p className="text-[11px] text-neutral-400">Paiement Mobile Money sécurisé</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-4 pt-6" aria-live="polite">
        {view === 'loading' && (
          <div className="space-y-3 py-20 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <p className="text-xs text-neutral-400">Chargement de votre récapitulatif…</p>
          </div>
        )}

        {view === 'error' && (
          <div className="mt-10 space-y-3 rounded-2xl border border-red-600 bg-neutral-900 p-5 text-center">
            <p className="text-sm font-semibold text-red-400">{errorMsg}</p>
            <Link
              to="/orders"
              className="inline-block rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-bold text-orange-400 transition-colors hover:bg-neutral-700"
            >
              Retour à mes commandes
            </Link>
          </div>
        )}

        {view === 'form' && summary && product && item && (
          <>
            <div className="flex items-center gap-3.5 rounded-2xl border border-neutral-800 bg-neutral-900 p-3.5">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800">
                {product.images?.[0] && <img src={getMediaUrl(product.images[0])} alt={product.title} className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-neutral-100">{product.title}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-neutral-400">
                  <span className="rounded-md bg-neutral-800 px-2 py-0.5 font-medium text-neutral-300">Qté : {item.quantity}</span>
                  <span>·</span>
                  <span className="font-medium text-emerald-400">{summary.totalWeightKg} kg (transport local)</span>
                </div>
              </div>
            </div>

            <div className="divide-y divide-neutral-800 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <SummaryRow
                label="Sous-total produit"
                value={currency === 'CDF' ? formatMoney(summary.subtotalCDF, 'CDF') : formatMoney(summary.subtotalUSD, 'USD')}
              />
              <SummaryRow
                icon={<Truck className="h-4 w-4 text-orange-500" />}
                label="Frais de livraison"
                value={currency === 'CDF' ? formatMoney(summary.deliveryFeeCDF, 'CDF') : formatMoney(summary.deliveryFeeUSD, 'USD')}
              />
              <SummaryRow
                icon={<Percent className="h-4 w-4 text-orange-500" />}
                label={`Commission plateforme (${Math.round(summary.commissionRate * 100)}%)`}
                value={currency === 'CDF' ? formatMoney(summary.commissionCDF, 'CDF') : formatMoney(summary.commissionUSD, 'USD')}
              />
              <div className="pt-2">
                <SummaryRow
                  icon={<Receipt className="h-4 w-4 text-orange-500" />}
                  label="Total à payer"
                  value={formatMoney(selectedAmount, currency)}
                  bold
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="ml-1 text-xs font-semibold text-neutral-300">Devise de paiement</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Devise de paiement">
                {(['CDF', 'USD'] as Currency[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={currency === c}
                    onClick={() => setCurrency(c)}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors ${
                      currency === c
                        ? 'border-[#c2410c] bg-[#c2410c] text-white'
                        : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                    }`}
                  >
                    {c === 'CDF' ? 'Francs congolais (CDF)' : 'Dollars (USD)'}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="ml-1 text-xs font-semibold text-neutral-300">Payer avec</legend>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Moyen de paiement">
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === 'mobile'}
                  onClick={() => setMethod('mobile')}
                  className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                    method === 'mobile' ? 'bg-[#c2410c] text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  Mobile Money
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === 'wallet'}
                  onClick={() => setMethod('wallet')}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${
                    method === 'wallet' ? 'bg-[#c2410c] text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  <WalletIcon className="h-4 w-4" />
                  Portefeuille
                </button>
              </div>
              {method === 'wallet' && (
                <div className="rounded-xl bg-neutral-800 px-4 py-3 text-xs">
                  <p className="text-neutral-300">
                    Solde disponible : <span className="font-bold text-white">{formatMoney(walletBalance, currency)}</span>
                  </p>
                  {!walletEnough && (
                    <p className="mt-1.5 font-semibold text-orange-400">
                      Solde insuffisant.{' '}
                      <Link to="/wallet" className="underline">
                        Déposer de l'argent
                      </Link>
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            {method === 'mobile' && (
            <div className="space-y-2">
              <label htmlFor="pay-phone" className="ml-1 block text-xs font-semibold text-neutral-300">
                Numéro Mobile Money du payeur <span className="text-orange-500">*</span>
              </label>
              <input
                id="pay-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, '').slice(0, 16))}
                placeholder="Ex : 0997654321"
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-500 focus:outline-none"
              />
              <p className="ml-1 text-[11px] text-neutral-500">10 chiffres. Vous recevrez une demande de confirmation sur ce numéro.</p>
              <p className="ml-1 text-[11px] font-semibold text-neutral-300">Réseaux acceptés : Airtel Money, Orange Money, M-Pesa et Afrimoney.</p>
            </div>
            )}

            <div className="space-y-2">
              <label htmlFor="pay-address" className="ml-1 block text-xs font-semibold text-neutral-300">
                Adresse de livraison exacte <span className="text-orange-500">*</span>
              </label>
              <textarea
                id="pay-address"
                value={address}
                onChange={(e) => setAddress(e.target.value.slice(0, 300))}
                placeholder="Ex : Commune, quartier, avenue, numéro…"
                rows={3}
                className="w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-500 focus:outline-none"
              />
            </div>

            {formError && (
              <p role="alert" className="rounded-xl border border-red-600 bg-neutral-900 px-4 py-3 text-xs font-semibold text-red-400">
                {formError}
              </p>
            )}

            <div className="space-y-3 pt-2">
              <button
                type="button"
                disabled={submitting || (method === 'mobile' && !phone.trim()) || !address.trim() || (method === 'wallet' && !walletEnough)}
                onClick={submit}
                className="w-full rounded-2xl bg-[#c2410c] px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#9a3412] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Envoi de la demande…' : `Payer ${formatMoney(selectedAmount, currency)}`}
              </button>
              {method === 'mobile' && (
                <p className="text-center text-[11px] text-neutral-500">
                  Des frais de l'opérateur peuvent s'ajouter. Le montant exact à confirmer s'affiche sur votre téléphone.
                </p>
              )}
              <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-neutral-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Montant calculé et vérifié par nos serveurs</span>
              </div>
            </div>
          </>
        )}

        {view === 'waiting' && payment && (
          <div className="mt-6 space-y-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            <div className="space-y-1.5">
              <h2 className="text-base font-bold">Confirmez le paiement sur votre téléphone</h2>
              <p className="text-xs text-neutral-400">
                Une demande a été envoyée au numéro {payment.phoneMasked}. Saisissez votre code PIN Mobile Money pour valider.
              </p>
            </div>
            <div className="divide-y divide-neutral-800 rounded-xl border border-neutral-800 bg-neutral-950 px-4 text-left">
              <SummaryRow label="Montant" value={formatMoney(payment.amount, payment.currency)} />
              {payment.feeAmount !== null && <SummaryRow label="Frais annoncés" value={formatMoney(payment.feeAmount, payment.currency)} />}
              {payment.totalCharged !== null && <SummaryRow label="Total débité" value={formatMoney(payment.totalCharged, payment.currency)} bold />}
              {payment.network && <SummaryRow label="Réseau" value={payment.network} />}
            </div>
            {pollWarning && (
              <p role="alert" className="text-xs font-semibold text-orange-400">
                Connexion instable : nous continuons de vérifier votre paiement.
              </p>
            )}
            <p className="text-[11px] text-neutral-500">
              La demande expire après 10 minutes. Vous pouvez quitter cette page : votre commande se mettra à jour automatiquement.
            </p>
            <Link to="/orders" className="inline-block text-xs font-bold text-orange-400 hover:text-orange-300">
              Voir mes commandes
            </Link>
          </div>
        )}

        {view === 'success' && (
          <div className="mt-6 space-y-4 rounded-2xl border border-emerald-600 bg-neutral-900 p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <div className="space-y-1.5">
              <h2 className="text-base font-bold">Paiement confirmé</h2>
              {payment && <p className="text-sm font-semibold text-emerald-400">{formatMoney(payment.amount, payment.currency)}</p>}
              <p className="text-xs text-neutral-400">Votre commande est en cours de livraison. Vous serez notifié à chaque étape.</p>
            </div>
            {payment && <p className="break-all text-[11px] text-neutral-500">Référence : {payment.id}</p>}
            <Link
              to="/orders"
              className="inline-block w-full rounded-xl bg-[#c2410c] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#9a3412]"
            >
              Voir mes commandes
            </Link>
          </div>
        )}

        {view === 'failed' && (
          <div className="mt-6 space-y-4 rounded-2xl border border-red-600 bg-neutral-900 p-6 text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-400" />
            <div className="space-y-1.5">
              <h2 className="text-base font-bold">Paiement non abouti</h2>
              <p className="text-xs text-neutral-400">{failureMessage(payment)}</p>
            </div>
            {payment && <p className="break-all text-[11px] text-neutral-500">Référence : {payment.id}</p>}
            {!needsSupport && (
              <button
                type="button"
                onClick={load}
                className="w-full rounded-xl bg-[#c2410c] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#9a3412]"
              >
                Réessayer
              </button>
            )}
            <Link to="/orders" className="inline-block text-xs font-bold text-orange-400 hover:text-orange-300">
              Retour à mes commandes
            </Link>
          </div>
        )}

        {(SUPPORT_PHONE || WHATSAPP_NUMBER) && view !== 'loading' && (
          <div className="mt-8 space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-center text-xs font-bold text-neutral-300">Besoin d'aide pour votre paiement ?</p>
            <div className="grid grid-cols-2 gap-2.5">
              {SUPPORT_PHONE && (
                <a
                  href={`tel:${SUPPORT_PHONE}`}
                  className="flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 text-xs font-semibold text-neutral-200 transition-colors hover:bg-neutral-800 hover:text-white"
                >
                  <Phone className="h-3.5 w-3.5 text-orange-500" />
                  <span>Appeler le support</span>
                </a>
              )}
              {WHATSAPP_NUMBER && (
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Bonjour, j'ai besoin d'aide pour le paiement de ma commande.")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-neutral-950 py-2.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-neutral-800"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}