import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Minus, Plus, Store, Truck, Wallet, X, Smartphone, MessageCircle, ClipboardList } from 'lucide-react';
import { api, ApiError } from '../lib/http';
import { getMediaUrl } from '../lib/media';
import { useAuth } from '../context/Authcontext';
import type { Preferences } from '../lib/settingsApi';

/**
 * Fenêtre « Me faire livrer » : réunit toutes les données nécessaires à une livraison réussie
 * (quantité, mode de réception, destinataire, adresse complète, paiement, note au vendeur).
 * Toutes les données sont revérifiées côté serveur ; les montants ne viennent jamais d'ici.
 */

export interface DeliveryProduct {
  id: string;
  title: string;
  priceUSD: number;
  priceCDF: number;
  quantity?: number;
  images?: string[];
  seller?: { id: string; name: string };
}

const DELIVERY_FEE_CDF = 2000; // affichage seulement : le serveur applique le tarif officiel
const COMMISSION_PERCENT = '0,5';

type Fulfillment = 'DELIVERY' | 'PICKUP';
type PaymentMethod = 'WALLET' | 'MOBILE_MONEY';

interface FormState {
  recipientName: string;
  phone: string;
  city: string;
  commune: string;
  quarter: string;
  address: string;
  landmark: string;
  note: string;
}

const EMPTY: FormState = { recipientName: '', phone: '', city: '', commune: '', quarter: '', address: '', landmark: '', note: '' };
const PHONE_RE = /^\+?[0-9 ()-]{6,20}$/;

const fieldCls = 'h-12 w-full rounded-xl bg-[#F2F4F7] px-3 text-sm text-[#111111] outline-none placeholder:text-[#98A2B3] focus:bg-[#FFF1E7]';
const fieldErrCls = 'bg-red-50';

function Choice({
  selected, onClick, icon: Icon, title, hint,
}: { selected: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex flex-1 items-start gap-3 rounded-xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:brightness-95 ${selected ? 'bg-[#FF6B00] text-white' : 'bg-[#F2F4F7] text-[#111111] hover:bg-[#EAECF0]'}`}
    >
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className={`block text-xs ${selected ? 'text-white/90' : 'text-[#667085]'}`}>{hint}</span>
      </span>
    </button>
  );
}

export default function DeliveryModal({ product, onClose }: { product: DeliveryProduct; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const maxQty = Math.max(1, product.quantity ?? 99);

  const [quantity, setQuantity] = useState(1);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('DELIVERY');
  const [payment, setPayment] = useState<PaymentMethod>('MOBILE_MONEY');
  const [form, setForm] = useState<FormState>({ ...EMPTY, recipientName: user?.name ?? '', phone: user?.phone ?? '' });
  const [saveDefault, setSaveDefault] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ sellerId: string } | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  // Pré-remplit avec l'adresse enregistrée dans les paramètres.
  useEffect(() => {
    let cancelled = false;
    api<{ data: Preferences }>('/settings/preferences')
      .then((res) => {
        if (cancelled) return;
        const d = res.data.delivery;
        setForm((prev) => ({
          ...prev,
          recipientName: d.recipientName || prev.recipientName,
          phone: d.phone || prev.phone,
          city: d.city, commune: d.commune, quarter: d.quarter, address: d.address, landmark: d.landmark,
        }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Fermeture avec Échap, défilement de la page bloqué derrière la fenêtre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstField.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [busy, onClose]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  const subtotalUSD = useMemo(() => Math.round(product.priceUSD * quantity * 100) / 100, [product.priceUSD, quantity]);
  const subtotalCDF = Math.round(product.priceCDF * quantity);
  const fee = fulfillment === 'DELIVERY' ? DELIVERY_FEE_CDF : 0;

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.recipientName.trim().length < 2) next.recipientName = 'Indiquez le nom de la personne qui recevra la commande.';
    if (!PHONE_RE.test(form.phone.trim())) next.phone = 'Numéro de téléphone invalide.';
    if (fulfillment === 'DELIVERY') {
      if (form.city.trim().length < 2) next.city = 'Indiquez la ville.';
      if (form.commune.trim().length < 2) next.commune = 'Indiquez la commune.';
      if (form.quarter.trim().length < 2) next.quarter = 'Indiquez le quartier.';
      if (form.address.trim().length < 2) next.address = "Indiquez l'adresse précise (avenue, numéro).";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (busy) return;
    setServerError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await api<{ sellerId?: string }>('/orders/delivery-request', {
        method: 'POST',
        body: {
          productId: product.id,
          quantity,
          fulfillment,
          paymentMethod: payment,
          recipientName: form.recipientName.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(), commune: form.commune.trim(), quarter: form.quarter.trim(), address: form.address.trim(),
          landmark: form.landmark.trim() || undefined,
          note: form.note.trim() || undefined,
          saveAsDefault: saveDefault,
        },
      });
      setDone({ sellerId: res.sellerId || product.seller?.id || '' });
    } catch (e) {
      setServerError(e instanceof ApiError || e instanceof Error ? e.message : 'La demande de livraison a échoué. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  const errText = (key: keyof FormState) => errors[key] && <span role="alert" className="mt-1 block text-xs font-semibold text-red-600">{errors[key]}</span>;
  const label = 'mb-1.5 block text-xs font-bold text-[#344054]';

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()} role="dialog" aria-modal="true" aria-label="Me faire livrer">
      <div className="flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-white sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center gap-3 px-5 pb-3 pt-5">
          <h2 className="flex-1 text-lg font-bold">{done ? 'Demande envoyée' : 'Me faire livrer'}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F4F7] text-[#344054] hover:bg-[#EAECF0] disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4 overflow-y-auto px-5 pb-6">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-green-50 p-6 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden="true" />
              <p className="text-base font-bold text-green-700">Le vendeur a été prévenu</p>
              <p className="text-sm text-green-700">Il doit confirmer que l'article est disponible. Vous serez notifié dès sa réponse.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {done.sellerId && (
                <button type="button" onClick={() => navigate(`/messages?with=${encodeURIComponent(done.sellerId)}`)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] text-sm font-bold text-white hover:bg-[#E85F00]">
                  <MessageCircle className="h-4 w-4" /> Ouvrir la conversation
                </button>
              )}
              <button type="button" onClick={() => navigate('/orders')} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#F2F4F7] text-sm font-bold text-[#111111] hover:bg-[#EAECF0]">
                <ClipboardList className="h-4 w-4" /> Mes commandes
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
              {/* Produit + quantité */}
              <div className="flex items-center gap-3 rounded-2xl bg-[#F2F4F7] p-3">
                <img src={getMediaUrl(product.images?.[0])} alt="" className="h-16 w-16 flex-shrink-0 rounded-xl bg-[#EAECF0] object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{product.title}</p>
                  <p className="text-sm font-extrabold text-[#FF6B00]">{product.priceUSD} $</p>
                  {product.seller && <p className="flex items-center gap-1 truncate text-xs text-[#667085]"><Store className="h-3 w-3" /> {product.seller.name}</p>}
                </div>
                <div className="flex items-center rounded-full bg-white">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Diminuer la quantité" className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                  <span className="w-7 text-center text-sm font-bold" aria-live="polite">{quantity}</span>
                  <button type="button" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty} aria-label="Augmenter la quantité" className="flex h-10 w-10 items-center justify-center rounded-full disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </div>
              </div>

              {/* Mode de réception */}
              <div>
                <p className={label}>Mode de réception</p>
                <div role="radiogroup" aria-label="Mode de réception" className="flex flex-col gap-2 sm:flex-row">
                  <Choice selected={fulfillment === 'DELIVERY'} onClick={() => setFulfillment('DELIVERY')} icon={Truck} title="Livraison" hint="2 000 FC, à l'adresse indiquée" />
                  <Choice selected={fulfillment === 'PICKUP'} onClick={() => setFulfillment('PICKUP')} icon={Store} title="Retrait chez le vendeur" hint="Gratuit, sans livraison" />
                </div>
              </div>

              {/* Destinataire */}
              <div className="space-y-3">
                <label className="block">
                  <span className={label}>Nom de la personne qui reçoit</span>
                  <input ref={firstField} value={form.recipientName} onChange={set('recipientName')} maxLength={80} autoComplete="name" className={`${fieldCls} ${errors.recipientName ? fieldErrCls : ''}`} />
                  {errText('recipientName')}
                </label>
                <label className="block">
                  <span className={label}>Téléphone (pour le livreur)</span>
                  <input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" maxLength={20} placeholder="0997654321" className={`${fieldCls} ${errors.phone ? fieldErrCls : ''}`} />
                  {errText('phone')}
                  <span className="mt-1 block text-xs text-[#667085]">Le vendeur ne voit pas votre numéro : il est transmis au livreur CBF SOKO.</span>
                </label>
              </div>

              {/* Adresse */}
              {fulfillment === 'DELIVERY' && (
                <div className="space-y-3">
                  <p className={label}>Adresse de livraison</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="sr-only">Ville</span>
                      <input value={form.city} onChange={set('city')} maxLength={60} placeholder="Ville" className={`${fieldCls} ${errors.city ? fieldErrCls : ''}`} />
                      {errText('city')}
                    </label>
                    <label className="block">
                      <span className="sr-only">Commune</span>
                      <input value={form.commune} onChange={set('commune')} maxLength={60} placeholder="Commune" className={`${fieldCls} ${errors.commune ? fieldErrCls : ''}`} />
                      {errText('commune')}
                    </label>
                  </div>
                  <label className="block">
                    <span className="sr-only">Quartier</span>
                    <input value={form.quarter} onChange={set('quarter')} maxLength={60} placeholder="Quartier" className={`${fieldCls} ${errors.quarter ? fieldErrCls : ''}`} />
                    {errText('quarter')}
                  </label>
                  <label className="block">
                    <span className="sr-only">Adresse précise</span>
                    <input value={form.address} onChange={set('address')} maxLength={200} placeholder="Avenue, numéro" className={`${fieldCls} ${errors.address ? fieldErrCls : ''}`} />
                    {errText('address')}
                  </label>
                  <label className="block">
                    <span className="sr-only">Point de repère</span>
                    <input value={form.landmark} onChange={set('landmark')} maxLength={120} placeholder="Point de repère (près de l'église, en face de...)" className={fieldCls} />
                  </label>
                </div>
              )}

              {/* Paiement */}
              <div>
                <p className={label}>Paiement (après vérification de l'article par CBF SOKO)</p>
                <div role="radiogroup" aria-label="Mode de paiement" className="flex flex-col gap-2 sm:flex-row">
                  <Choice selected={payment === 'MOBILE_MONEY'} onClick={() => setPayment('MOBILE_MONEY')} icon={Smartphone} title="Mobile Money" hint="Paiement direct sur votre téléphone" />
                  <Choice selected={payment === 'WALLET'} onClick={() => setPayment('WALLET')} icon={Wallet} title="Portefeuille CBF Soko" hint="Depuis votre solde" />
                </div>
              </div>

              <label className="block">
                <span className={label}>Note pour le vendeur (facultatif)</span>
                <textarea value={form.note} onChange={set('note')} maxLength={300} rows={2} placeholder="Une précision sur l'article, le moment de passage..." className="w-full resize-none rounded-xl bg-[#F2F4F7] px-3 py-3 text-sm outline-none placeholder:text-[#98A2B3] focus:bg-[#FFF1E7]" />
              </label>

              {fulfillment === 'DELIVERY' && (
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={saveDefault} onChange={(e) => setSaveDefault(e.target.checked)} className="h-5 w-5 accent-[#FF6B00]" />
                  Enregistrer cette adresse pour mes prochaines commandes
                </label>
              )}

              {/* Récapitulatif */}
              <div className="space-y-1.5 rounded-2xl bg-[#F2F4F7] p-4 text-sm">
                <div className="flex justify-between"><span className="text-[#667085]">Articles ({quantity})</span><span className="font-semibold">{subtotalUSD} $</span></div>
                <div className="flex justify-between"><span className="text-[#667085]">Livraison</span><span className="font-semibold">{fee > 0 ? `${fee.toLocaleString('fr-FR')} FC` : 'Gratuite'}</span></div>
                <div className="flex justify-between"><span className="text-[#667085]">Commission plateforme</span><span className="font-semibold">{COMMISSION_PERCENT} %</span></div>
                {subtotalCDF > 0 && <div className="flex justify-between"><span className="text-[#667085]">Articles en francs</span><span className="font-semibold">{subtotalCDF.toLocaleString('fr-FR')} FC</span></div>}
                <p className="pt-1 text-xs text-[#667085]">Le montant exact à payer s'affiche après la vérification de l'article. Rien n'est débité maintenant.</p>
              </div>

              {serverError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">{serverError}</p>}
            </div>

            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
              <button type="button" onClick={submit} disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] text-sm font-bold text-white transition-colors hover:bg-[#E85F00] disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? 'Envoi en cours…' : 'Envoyer la demande au vendeur'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
