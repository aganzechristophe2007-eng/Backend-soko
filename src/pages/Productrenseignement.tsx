import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, MapPin, MessageSquare, Palmtree, Send, Store, Truck, Loader2 } from 'lucide-react';
import { apiFetch } from '../api/client';
import { api } from '../lib/http';
import { getMediaUrl } from '../lib/media';
import AuthSheet from './Authsheet';
import { useAuth } from '../context/Authcontext';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ProductItem {
  id: string;
  title: string;
  description?: string;
  priceUSD: number;
  priceCDF: number;
  category?: { id: string; name: string };
  images: string[];
  seller?: { id: string; name: string; avatar?: string; onVacation?: boolean; vacationNote?: string };
  location?: string;
  state?: string;
  quantity?: number;
  type?: string;
  isSold?: boolean;
  negotiable?: boolean;
  createdAt?: string;
}

const STATE_LABELS: Record<string, string> = {
  NEUF: 'Neuf',
  OCCASION_BON_ETAT: 'Occasion, bon état',
  OCCASION_MOYEN: 'Occasion, état moyen',
};

// Questions rapides : l'acheteur coche ce qu'il veut savoir, le message part déjà rédigé.
const QUICK_QUESTIONS_BASE = [
  'Cet article est-il toujours disponible ?',
  'Quel est le délai pour me le livrer ?',
  "Quel est l'état exact de l'article ?",
  'Pouvez-vous m’envoyer plus de photos ou une vidéo ?',
  'Y a-t-il une garantie ou un retour possible ?',
];

// Le vendeur a indiqué si le prix est négociable : on ne pose la question de prix que si elle a un sens.
const questionsFor = (negotiable?: boolean): string[] =>
  negotiable ? [QUICK_QUESTIONS_BASE[0], 'Quel est votre dernier prix ?', ...QUICK_QUESTIONS_BASE.slice(1)] : QUICK_QUESTIONS_BASE;

/* ------------------------------------------------------------------ */
/*  Page ProductRenseignement                                         */
/* ------------------------------------------------------------------ */

export default function ProductRenseignement() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, login: authLogin } = useAuth() as any;

  const [product, setProduct] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  const [selected, setSelected] = useState<string[]>([QUICK_QUESTIONS_BASE[0]]);
  const [extra, setExtra] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [showAuth, setShowAuth] = useState(false);

  const muted = 'text-[#667085]';
  const iconBtn = 'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#F2F4F7] text-[#344054] transition-colors hover:bg-[#EAECF0] focus-visible:outline-none focus-visible:bg-[#EAECF0]';

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiFetch(`/products/${id}`)
      .then((data) => {
        if (cancelled) return;
        const item = (data?.product ?? data?.data ?? data) as ProductItem;
        setProduct(item && item.id ? item : null);
        if (!item || !item.id) setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const isRequest = String(product?.type || '').toUpperCase() === 'REQUEST';
  const isOwner = !!product?.seller?.id && product.seller.id === user?.id;
  const canOrder = !!product && !isRequest && !isOwner && !product.isSold && !product.seller?.onVacation;
  const publishedOn = product?.createdAt ? new Date(product.createdAt).toLocaleDateString('fr-FR') : null;

  const toggle = (q: string) => setSelected((prev) => (prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q]));

  const buildMessage = (): string => {
    if (!product) return '';
    const lines = [`Bonjour, je suis intéressé(e) par « ${product.title} » (${product.priceUSD} $).`];
    if (selected.length > 0) {
      lines.push('', 'Mes questions :');
      selected.forEach((q) => lines.push(`• ${q}`));
    }
    if (extra.trim()) lines.push('', extra.trim());
    return lines.join('\n').slice(0, 3900);
  };

  const sendEnquiry = async () => {
    if (!product?.seller || sending) return;
    if (!user) { setShowAuth(true); return; }
    if (selected.length === 0 && !extra.trim()) {
      setSendError('Choisissez au moins une question ou écrivez un message.');
      return;
    }
    setSendError('');
    setSending(true);
    try {
      await api('/messages', { method: 'POST', body: { receiverId: product.seller.id, content: buildMessage() } });
      navigate('/messages', { state: { partner: { id: product.seller.id, name: product.seller.name, avatar: product.seller.avatar ?? null } } });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Envoi impossible pour le moment. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  const openConversation = () => {
    if (!product?.seller) return;
    if (!user) { setShowAuth(true); return; }
    navigate('/messages', { state: { partner: { id: product.seller.id, name: product.seller.name, avatar: product.seller.avatar ?? null } } });
  };

  const rows: { label: string; value: React.ReactNode }[] = [];
  if (product) {
    if (product.category?.name) rows.push({ label: 'Catégorie', value: product.category.name });
    if (product.state) rows.push({ label: 'État', value: STATE_LABELS[product.state] ?? product.state });
    if (typeof product.quantity === 'number') rows.push({ label: 'Quantité disponible', value: product.quantity });
    if (product.location) rows.push({ label: 'Localisation', value: <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#FF6B00]" />{product.location}</span> });
    if (publishedOn) rows.push({ label: 'Publié le', value: publishedOn });
  }

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <header className="sticky top-0 z-40 bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <button type="button" onClick={goBack} className={iconBtn} aria-label="Retour"><ArrowLeft className="h-5 w-5" /></button>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">Me renseigner</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-4 pb-16">
        {loading ? (
          <div className="space-y-4" aria-busy="true">
            <div className="skeleton h-28 w-full" />
            <div className="skeleton h-48 w-full" />
            <div className="skeleton h-24 w-full" />
          </div>
        ) : error || !product ? (
          <div className="rounded-2xl bg-[#F2F4F7] px-4 py-16 text-center">
            <p className="text-base font-bold">Ce produit est introuvable.</p>
            <p className={`mt-1 text-sm ${muted}`}>Il a peut-être été retiré par le vendeur.</p>
            <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#FF6B00] px-6 text-sm font-bold text-white hover:bg-[#E85F00]">Retour à l'accueil</Link>
          </div>
        ) : (
          <>
            {/* Résumé du produit */}
            <Link to={`/products/${product.id}`} className="flex items-center gap-3 rounded-2xl bg-[#F2F4F7] p-3 transition-colors hover:bg-[#EAECF0]">
              <img src={getMediaUrl(product.images?.[0])} alt={product.title} className="h-20 w-20 flex-shrink-0 rounded-xl bg-[#EAECF0] object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{product.title}</p>
                <p className="mt-1 text-lg font-extrabold text-[#FF6B00]">{product.priceUSD} $</p>
                <p className={`text-xs ${muted}`}>Voir la page du produit</p>
              </div>
              <ChevronRight className={`h-5 w-5 flex-shrink-0 ${muted}`} aria-hidden="true" />
            </Link>

            {/* Questions rapides */}
            {product.seller && !isOwner && (
              <section aria-labelledby="quick-title" className="rounded-3xl bg-[#F2F4F7] p-4">
                <h2 id="quick-title" className="text-base font-bold">Poser vos questions au vendeur</h2>
                <p className={`mt-0.5 text-xs ${muted}`}>Cochez ce que vous voulez savoir : le message part déjà rédigé, et la conversation s'ouvre ensuite.</p>
                <div className="mt-3 space-y-2" role="group" aria-label="Questions rapides">
                  {questionsFor(product.negotiable).map((q) => {
                    const on = selected.includes(q);
                    return (
                      <button
                        key={q}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(q)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:brightness-95 ${on ? 'bg-[#FF6B00] text-white' : 'bg-white text-[#111111] hover:bg-[#EAECF0]'}`}
                      >
                        <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md ${on ? 'bg-white text-[#FF6B00]' : 'bg-[#EAECF0]'}`}>{on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                        {q}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className="sr-only">Votre message</span>
                  <textarea
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Autre question ? Écrivez-la ici (facultatif)"
                    className="w-full resize-none rounded-xl bg-white px-3 py-3 text-sm outline-none placeholder:text-[#98A2B3] focus:bg-[#FFF8F3]"
                  />
                </label>
                {sendError && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{sendError}</p>}
                <button
                  type="button"
                  onClick={sendEnquiry}
                  disabled={sending}
                  className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] text-sm font-bold text-white transition-colors hover:bg-[#E85F00] disabled:opacity-60"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  {sending ? 'Envoi…' : 'Envoyer et ouvrir la conversation'}
                </button>
                <button type="button" onClick={openConversation} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-[#344054] hover:bg-[#EAECF0]">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" /> Écrire directement à ma façon
                </button>
              </section>
            )}

            {product.seller?.onVacation && (
              <p className="flex items-start gap-2 rounded-2xl bg-[#FFF1E7] p-4 text-sm font-medium text-[#C94F00]" role="status">
                <Palmtree className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>Ce vendeur est en vacances : il pourra répondre plus tard et les commandes sont suspendues.{product.seller.vacationNote ? ` ${product.seller.vacationNote}` : ''}</span>
              </p>
            )}

            {/* Caractéristiques */}
            {rows.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-bold">Caractéristiques</h2>
                <dl className="divide-y divide-[#EAECF0] rounded-2xl bg-[#F2F4F7]">
                  {rows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4 px-4 py-3 text-sm">
                      <dt className={muted}>{row.label}</dt>
                      <dd className="text-right font-semibold">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* Description */}
            <section>
              <h2 className="mb-2 text-sm font-bold">Description</h2>
              {product.description ? (
                <p className="whitespace-pre-line rounded-2xl bg-[#F2F4F7] p-4 text-sm leading-relaxed text-[#344054]">{product.description}</p>
              ) : (
                <p className={`rounded-2xl bg-[#F2F4F7] p-4 text-sm ${muted}`}>Le vendeur n'a pas ajouté de description. Posez-lui vos questions ci-dessus.</p>
              )}
            </section>

            {/* Vendeur */}
            {product.seller && (
              <section>
                <h2 className="mb-2 text-sm font-bold">Vendeur</h2>
                <Link to={`/users/${product.seller.id}`} className="flex items-center gap-3 rounded-2xl bg-[#F2F4F7] p-3 transition-colors hover:bg-[#EAECF0]">
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#FF6B00] text-white">
                    {product.seller.avatar ? <img src={getMediaUrl(product.seller.avatar)} alt={product.seller.name} className="h-full w-full object-cover" /> : <Store className="h-5 w-5" />}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">{product.seller.name}</p>
                  <ChevronRight className={`h-5 w-5 flex-shrink-0 ${muted}`} aria-hidden="true" />
                </Link>
              </section>
            )}

            {canOrder && (
              <button
                type="button"
                onClick={() => navigate(`/products/${product.id}?livraison=1`)}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#111111] text-sm font-bold text-white transition-colors hover:bg-[#333333]"
              >
                <Truck className="h-4 w-4" aria-hidden="true" /> Me faire livrer
              </button>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {showAuth && <AuthSheet onClose={() => setShowAuth(false)} onSuccess={(nextUser: any) => { authLogin(nextUser); setShowAuth(false); }} />}
      </AnimatePresence>
    </div>
  );
}
