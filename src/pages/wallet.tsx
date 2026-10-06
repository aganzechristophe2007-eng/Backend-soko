import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowDownToLine, ArrowUpFromLine, Send, Copy, Check, Loader2,
  CheckCircle2, XCircle, ShieldCheck, ShoppingBag, RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../api/client';

type Currency = 'CDF' | 'USD';
type Panel = null | 'deposit' | 'withdraw' | 'transfer';

interface WalletDto {
  number: string;
  balanceCDF: number;
  balanceUSD: number;
  limits: Record<Currency, { min: number; max: number }>;
}

interface TxDto {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'PAYMENT' | 'REFUND' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  amount: number;
  currency: Currency;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  counterpartyName: string | null;
  orderId: string | null;
}

interface OpDto {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'COMPLETED';
  amount: number;
  currency: Currency;
  phoneMasked: string;
  failureCode: string | null;
}

const POLL_INTERVAL_MS = 3000;

function formatMoney(n: number, currency: Currency): string {
  return currency === 'CDF'
    ? `${Math.round(n).toLocaleString('fr-FR')} CDF`
    : `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
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

// Accepte « CBF-12345678 », « cbf 12345678 » ou seulement les 8 chiffres.
function normalizeWalletNumber(input: string): string | null {
  const v = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d{8}$/.test(v)) return `CBF-${v}`;
  if (/^CBF\d{8}$/.test(v)) return `CBF-${v.slice(3)}`;
  return null;
}

function parseAmount(raw: string, currency: Currency): number | null {
  const v = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (currency === 'CDF' && !Number.isInteger(n)) return null;
  return n;
}

function newIdempotencyKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function depositFailure(code: string | null): string {
  switch (code) {
    case 'REFUSED':
      return 'Le dépôt a été refusé. Vérifiez votre numéro Mobile Money, puis réessayez.';
    case 'DECLINED':
      return "Le dépôt n'a pas été validé (refusé, annulé ou solde insuffisant). Vous pouvez réessayer.";
    case 'EXPIRED':
      return 'Le délai de confirmation est dépassé. Réessayez et validez rapidement sur votre téléphone.';
    case 'NOT_FOUND':
      return "La demande de dépôt n'a pas pu être envoyée. Vous pouvez réessayer.";
    case 'AMOUNT_MISMATCH':
      return 'Une vérification manuelle est nécessaire. Contactez le support avec la référence ci-dessous.';
    default:
      return "Le dépôt n'a pas abouti. Vous pouvez réessayer.";
  }
}

function withdrawalFailure(code: string | null): string {
  switch (code) {
    case 'REFUSED':
      return 'Le retrait a été refusé. Vérifiez votre numéro Mobile Money. Le montant a été remis dans votre portefeuille.';
    default:
      return "Le retrait n'a pas abouti. Le montant a été remis dans votre portefeuille.";
  }
}

const INPUT =
  'w-full rounded-xl bg-neutral-800 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:bg-neutral-700 focus:outline-none';
const BTN_PRIMARY =
  'w-full rounded-xl bg-[#c2410c] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#9a3412] disabled:cursor-not-allowed disabled:opacity-40';

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="ml-1 block text-xs font-semibold text-neutral-300">
        {label}
      </label>
      {children}
      {hint && <p className="ml-1 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

function CurrencyToggle({ value, onChange, disabled }: { value: Currency; onChange: (c: Currency) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Devise">
      {(['CDF', 'USD'] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
            value === c ? 'bg-[#c2410c] text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          {c === 'CDF' ? 'Francs (CDF)' : 'Dollars (USD)'}
        </button>
      ))}
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-xs font-semibold text-red-300">
      {message}
    </p>
  );
}

// Suit une opération (dépôt ou retrait) : le serveur interroge WonyaPay à chaque appel.
function useOperationPoll(path: string | null, onDone: () => void) {
  const [op, setOp] = useState<OpDto | null>(null);
  const [warning, setWarning] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!path) return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        const res = await apiFetch(path);
        if (stopped) return;
        failures = 0;
        setWarning(false);
        const next = res.data as OpDto;
        setOp(next);
        if (next.status !== 'PENDING') {
          if (timer) clearInterval(timer);
          doneRef.current();
        }
      } catch {
        failures += 1;
        if (failures >= 5 && !stopped) setWarning(true);
      }
    };

    tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [path]);

  return { op, warning };
}

// ------------------------------------------
// Dépôt
// ------------------------------------------
function DepositForm({ limits, onChanged }: { limits: WalletDto['limits']; onChanged: () => void }) {
  const [currency, setCurrency] = useState<Currency>('CDF');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [depositId, setDepositId] = useState<string | null>(null);
  const { op, warning } = useOperationPoll(depositId ? `/wallet/deposits/${depositId}` : null, onChanged);

  const reset = () => {
    setDepositId(null);
    setAmount('');
    setError('');
  };

  const submit = async () => {
    if (submitting) return;
    const value = parseAmount(amount, currency);
    const normalized = normalizePhone(phone);
    if (value === null) return setError(currency === 'CDF' ? 'Montant invalide (nombre entier).' : 'Montant invalide (2 décimales au plus).');
    if (value < limits[currency].min) return setError(`Montant minimum : ${formatMoney(limits[currency].min, currency)}.`);
    if (value > limits[currency].max) return setError(`Montant maximum : ${formatMoney(limits[currency].max, currency)}.`);
    if (!normalized) return setError('Numéro Mobile Money invalide (10 chiffres, ex. 0997654321).');

    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/wallet/deposits', {
        method: 'POST',
        body: JSON.stringify({ currency, amount: value, phone: normalized }),
      });
      setDepositId((res.data as OpDto).id);
    } catch (err: any) {
      if (err?.data?.code === 'DEPOSIT_IN_PROGRESS' && err?.data?.depositId) setDepositId(err.data.depositId);
      else setError(err?.message || 'Impossible de lancer le dépôt.');
    } finally {
      setSubmitting(false);
    }
  };

  if (depositId) {
    if (!op || op.status === 'PENDING') {
      return (
        <div className="space-y-4 py-2 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" />
          <h3 className="text-sm font-bold text-white">Confirmez le dépôt sur votre téléphone</h3>
          <p className="text-xs text-neutral-400">
            {op ? `Une demande a été envoyée au numéro ${op.phoneMasked}. ` : ''}Saisissez votre code PIN Mobile Money pour valider.
          </p>
          {warning && <p className="text-xs font-semibold text-orange-400">Connexion instable : nous continuons de vérifier votre dépôt.</p>}
          <p className="text-[11px] text-neutral-500">La demande expire après 10 minutes. Vous pouvez quitter cette page : votre solde se mettra à jour automatiquement.</p>
        </div>
      );
    }
    if (op.status === 'SUCCESS') {
      return (
        <div className="space-y-3 py-2 text-center">
          <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Dépôt confirmé</h3>
          <p className="text-sm font-semibold text-emerald-400">{formatMoney(op.amount, op.currency)}</p>
          <button type="button" onClick={reset} className={BTN_PRIMARY}>Faire un autre dépôt</button>
        </div>
      );
    }
    return (
      <div className="space-y-3 py-2 text-center">
        <XCircle className="mx-auto h-11 w-11 text-red-400" />
        <h3 className="text-sm font-bold text-white">Dépôt non abouti</h3>
        <p className="text-xs text-neutral-400">{depositFailure(op.failureCode)}</p>
        <p className="break-all text-[11px] text-neutral-500">Référence : {op.id}</p>
        {op.failureCode !== 'AMOUNT_MISMATCH' && (
          <button type="button" onClick={reset} className={BTN_PRIMARY}>Réessayer</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CurrencyToggle value={currency} onChange={setCurrency} />
      <Field label="Montant à déposer" htmlFor="dep-amount" hint={`Entre ${formatMoney(limits[currency].min, currency)} et ${formatMoney(limits[currency].max, currency)}.`}>
        <input
          id="dep-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, '').slice(0, 12))}
          placeholder={currency === 'CDF' ? 'Ex : 50000' : 'Ex : 20'}
          className={INPUT}
        />
      </Field>
      <Field label="Numéro Mobile Money" htmlFor="dep-phone" hint="Airtel Money, Orange Money, M-Pesa ou Afrimoney. Vous recevrez une demande de confirmation sur ce numéro.">
        <input
          id="dep-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, '').slice(0, 16))}
          placeholder="Ex : 0997654321"
          className={INPUT}
        />
      </Field>
      <ErrorLine message={error} />
      <button type="button" disabled={submitting || !amount.trim() || !phone.trim()} onClick={submit} className={BTN_PRIMARY}>
        {submitting ? 'Envoi de la demande…' : 'Déposer'}
      </button>
      <p className="text-center text-[11px] text-neutral-500">Des frais de l'opérateur peuvent s'ajouter. Le montant exact à confirmer s'affiche sur votre téléphone.</p>
    </div>
  );
}

// ------------------------------------------
// Retrait
// ------------------------------------------
function WithdrawForm({ wallet, onChanged }: { wallet: WalletDto; onChanged: () => void }) {
  const [currency, setCurrency] = useState<Currency>('CDF');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const { op, warning } = useOperationPoll(withdrawalId ? `/wallet/withdrawals/${withdrawalId}` : null, onChanged);

  const balance = currency === 'CDF' ? wallet.balanceCDF : wallet.balanceUSD;
  const limits = wallet.limits[currency];

  const reset = () => {
    setWithdrawalId(null);
    setAmount('');
    setPassword('');
    setError('');
  };

  const submit = async () => {
    if (submitting) return;
    const value = parseAmount(amount, currency);
    const normalized = normalizePhone(phone);
    if (value === null) return setError(currency === 'CDF' ? 'Montant invalide (nombre entier).' : 'Montant invalide (2 décimales au plus).');
    if (value < limits.min) return setError(`Montant minimum : ${formatMoney(limits.min, currency)}.`);
    if (value > limits.max) return setError(`Montant maximum par retrait : ${formatMoney(limits.max, currency)}.`);
    if (value > balance) return setError('Solde insuffisant.');
    if (!normalized) return setError('Numéro Mobile Money invalide (10 chiffres, ex. 0997654321).');
    if (!password) return setError('Saisissez votre mot de passe pour confirmer.');

    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch('/wallet/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ currency, amount: value, phone: normalized, password }),
      });
      setPassword('');
      setWithdrawalId((res.data as OpDto).id);
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'Impossible de lancer le retrait.');
    } finally {
      setSubmitting(false);
    }
  };

  if (withdrawalId) {
    if (!op || op.status === 'PENDING') {
      return (
        <div className="space-y-4 py-2 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" />
          <h3 className="text-sm font-bold text-white">Retrait en cours</h3>
          <p className="text-xs text-neutral-400">Votre argent est en route vers {op?.phoneMasked ?? 'votre téléphone'}. Cela prend généralement moins d'une minute.</p>
          {warning && <p className="text-xs font-semibold text-orange-400">Connexion instable : nous continuons de vérifier votre retrait.</p>}
        </div>
      );
    }
    if (op.status === 'COMPLETED') {
      return (
        <div className="space-y-3 py-2 text-center">
          <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Retrait effectué</h3>
          <p className="text-sm font-semibold text-emerald-400">{formatMoney(op.amount, op.currency)}</p>
          <p className="text-xs text-neutral-400">Envoyé sur {op.phoneMasked}. Aucun frais.</p>
          <button type="button" onClick={reset} className={BTN_PRIMARY}>Faire un autre retrait</button>
        </div>
      );
    }
    return (
      <div className="space-y-3 py-2 text-center">
        <XCircle className="mx-auto h-11 w-11 text-red-400" />
        <h3 className="text-sm font-bold text-white">Retrait non abouti</h3>
        <p className="text-xs text-neutral-400">{withdrawalFailure(op.failureCode)}</p>
        <button type="button" onClick={reset} className={BTN_PRIMARY}>Réessayer</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CurrencyToggle value={currency} onChange={setCurrency} />
      <Field label="Montant à retirer" htmlFor="wd-amount" hint={`Solde disponible : ${formatMoney(balance, currency)}. Aucun frais de retrait.`}>
        <input
          id="wd-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, '').slice(0, 12))}
          placeholder={currency === 'CDF' ? 'Ex : 50000' : 'Ex : 20'}
          className={INPUT}
        />
      </Field>
      <Field label="Numéro Mobile Money qui reçoit l'argent" htmlFor="wd-phone">
        <input
          id="wd-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, '').slice(0, 16))}
          placeholder="Ex : 0997654321"
          className={INPUT}
        />
      </Field>
      <Field label="Mot de passe" htmlFor="wd-pass" hint="Demandé pour confirmer qu'il s'agit bien de vous.">
        <input id="wd-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value.slice(0, 200))} className={INPUT} />
      </Field>
      <ErrorLine message={error} />
      <button type="button" disabled={submitting || !amount.trim() || !phone.trim() || !password} onClick={submit} className={BTN_PRIMARY}>
        {submitting ? 'Envoi…' : 'Retirer'}
      </button>
    </div>
  );
}

// ------------------------------------------
// Transfert vers un autre portefeuille
// ------------------------------------------
function TransferForm({ wallet, onChanged }: { wallet: WalletDto; onChanged: () => void }) {
  const [numberInput, setNumberInput] = useState('');
  const [recipient, setRecipient] = useState<{ number: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [currency, setCurrency] = useState<Currency>('CDF');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ amount: number; currency: Currency; name: string } | null>(null);
  // La même clé est réutilisée si l'envoi est répété après une coupure réseau : un seul débit possible.
  const keyRef = useRef(newIdempotencyKey());

  const balance = currency === 'CDF' ? wallet.balanceCDF : wallet.balanceUSD;
  const limits = wallet.limits[currency];

  const search = async () => {
    const normalized = normalizeWalletNumber(numberInput);
    if (!normalized) return setError('Numéro de portefeuille invalide (ex : CBF-12345678).');
    setSearching(true);
    setError('');
    setRecipient(null);
    try {
      const res = await apiFetch(`/wallet/lookup/${normalized}`);
      setRecipient(res.data as { number: string; name: string });
    } catch (err: any) {
      setError(err?.message || 'Recherche impossible.');
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (submitting || !recipient) return;
    const value = parseAmount(amount, currency);
    if (value === null) return setError(currency === 'CDF' ? 'Montant invalide (nombre entier).' : 'Montant invalide (2 décimales au plus).');
    if (value < limits.min) return setError(`Montant minimum : ${formatMoney(limits.min, currency)}.`);
    if (value > limits.max) return setError(`Montant maximum par envoi : ${formatMoney(limits.max, currency)}.`);
    if (value > balance) return setError('Solde insuffisant.');
    if (!password) return setError('Saisissez votre mot de passe pour confirmer.');

    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/wallet/transfers', {
        method: 'POST',
        body: JSON.stringify({ currency, amount: value, toNumber: recipient.number, password, idempotencyKey: keyRef.current }),
      });
      setDone({ amount: value, currency, name: recipient.name });
      setPassword('');
      onChanged();
    } catch (err: any) {
      setError(err?.message || "Impossible d'envoyer l'argent.");
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    keyRef.current = newIdempotencyKey();
    setDone(null);
    setRecipient(null);
    setNumberInput('');
    setAmount('');
    setError('');
  };

  if (done) {
    return (
      <div className="space-y-3 py-2 text-center">
        <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-400" />
        <h3 className="text-sm font-bold text-white">Envoi effectué</h3>
        <p className="text-sm font-semibold text-emerald-400">{formatMoney(done.amount, done.currency)}</p>
        <p className="text-xs text-neutral-400">Envoyé à {done.name}.</p>
        <button type="button" onClick={restart} className={BTN_PRIMARY}>Faire un autre envoi</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Field label="Numéro de portefeuille du destinataire" htmlFor="tr-number" hint="Demandez-lui son numéro, visible en haut de sa page Portefeuille.">
        <div className="flex gap-2">
          <input
            id="tr-number"
            value={numberInput}
            onChange={(e) => {
              setNumberInput(e.target.value.slice(0, 14));
              setRecipient(null);
            }}
            placeholder="CBF-12345678"
            autoCapitalize="characters"
            className={INPUT}
          />
          <button
            type="button"
            onClick={search}
            disabled={searching || !numberInput.trim()}
            className="shrink-0 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-neutral-900 transition-colors hover:bg-white disabled:opacity-40"
          >
            {searching ? '…' : 'Vérifier'}
          </button>
        </div>
      </Field>

      {recipient && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-950 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{recipient.name}</p>
            <p className="text-[11px] text-emerald-300">{recipient.number}</p>
          </div>
        </div>
      )}

      {recipient && (
        <>
          <CurrencyToggle value={currency} onChange={setCurrency} />
          <Field label="Montant à envoyer" htmlFor="tr-amount" hint={`Solde disponible : ${formatMoney(balance, currency)}. Aucun frais.`}>
            <input
              id="tr-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, '').slice(0, 12))}
              placeholder={currency === 'CDF' ? 'Ex : 10000' : 'Ex : 5'}
              className={INPUT}
            />
          </Field>
          <Field label="Mot de passe" htmlFor="tr-pass" hint="Demandé pour confirmer qu'il s'agit bien de vous.">
            <input id="tr-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value.slice(0, 200))} className={INPUT} />
          </Field>
        </>
      )}

      <ErrorLine message={error} />

      {recipient && (
        <button type="button" disabled={submitting || !amount.trim() || !password} onClick={submit} className={BTN_PRIMARY}>
          {submitting ? 'Envoi…' : `Envoyer à ${recipient.name}`}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------
// Historique
// ------------------------------------------
const TX_LABEL: Record<TxDto['type'], string> = {
  DEPOSIT: 'Dépôt',
  WITHDRAWAL: 'Retrait',
  PAYMENT: 'Paiement de commande',
  REFUND: 'Remboursement',
  TRANSFER_IN: 'Argent reçu',
  TRANSFER_OUT: 'Argent envoyé',
};
const CREDIT_TYPES: TxDto['type'][] = ['DEPOSIT', 'REFUND', 'TRANSFER_IN'];

function TxIcon({ type }: { type: TxDto['type'] }) {
  const cls = 'h-4 w-4';
  switch (type) {
    case 'DEPOSIT':
      return <ArrowDownToLine className={cls} />;
    case 'WITHDRAWAL':
      return <ArrowUpFromLine className={cls} />;
    case 'PAYMENT':
      return <ShoppingBag className={cls} />;
    case 'REFUND':
      return <RotateCcw className={cls} />;
    default:
      return <Send className={cls} />;
  }
}

function TxRow({ tx }: { tx: TxDto }) {
  const credit = CREDIT_TYPES.includes(tx.type);
  const failed = tx.status === 'FAILED';
  const pending = tx.status === 'PENDING';
  const who = tx.counterpartyName ? (tx.type === 'TRANSFER_IN' ? ` de ${tx.counterpartyName}` : ` à ${tx.counterpartyName}`) : '';
  const date = new Date(tx.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const amountColor = failed ? 'text-neutral-500 line-through' : pending ? 'text-orange-400' : credit ? 'text-emerald-400' : 'text-red-400';

  return (
    <li className="flex items-center gap-3 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${credit ? 'bg-emerald-950 text-emerald-400' : 'bg-neutral-800 text-orange-400'}`}>
        <TxIcon type={tx.type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-100">
          {TX_LABEL[tx.type]}
          {who}
        </p>
        <p className="text-[11px] text-neutral-500">
          {date}
          {pending && ' · En cours'}
          {failed && ' · Échoué, montant remis'}
        </p>
      </div>
      <p className={`shrink-0 text-sm font-bold ${amountColor}`}>
        {credit ? '+' : '-'}
        {formatMoney(tx.amount, tx.currency)}
      </p>
    </li>
  );
}

// ------------------------------------------
// Page
// ------------------------------------------
export default function WalletPage() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [txs, setTxs] = useState<TxDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [w, t] = await Promise.all([apiFetch('/wallet'), apiFetch('/wallet/transactions')]);
      setWallet(w.data as WalletDto);
      setTxs(t.data as TxDto[]);
      setNextCursor((t.nextCursor ?? null) as string | null);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger votre portefeuille.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const t = await apiFetch(`/wallet/transactions?cursor=${encodeURIComponent(nextCursor)}`);
      setTxs((prev) => [...prev, ...(t.data as TxDto[])]);
      setNextCursor((t.nextCursor ?? null) as string | null);
    } catch {
      // l'utilisateur peut réessayer
    } finally {
      setLoadingMore(false);
    }
  };

  const copyNumber = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // copie impossible : le numéro reste affiché
    }
  };

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const PANEL_TITLE: Record<Exclude<Panel, null>, string> = {
    deposit: 'Déposer de l’argent',
    withdraw: 'Retirer vers Mobile Money',
    transfer: 'Envoyer à un portefeuille',
  };

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-white">
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-neutral-950 px-4 py-3.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Retour"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-sm font-bold leading-tight">Mon portefeuille</h1>
          <p className="text-[11px] text-neutral-400">Déposez, payez, retirez ou envoyez de l'argent</p>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 pt-3" aria-live="polite">
        {loading && (
          <div className="py-20 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-orange-500" />
          </div>
        )}

        {!loading && loadError && (
          <div className="space-y-3 rounded-2xl bg-neutral-900 p-5 text-center">
            <p className="text-sm font-semibold text-red-400">{loadError}</p>
            <button type="button" onClick={refresh} className="rounded-xl bg-neutral-800 px-4 py-2 text-xs font-bold text-orange-400 transition-colors hover:bg-neutral-700">
              Réessayer
            </button>
          </div>
        )}

        {!loading && wallet && (
          <>
            <section className="space-y-2 rounded-2xl bg-[#181818] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Numéro de portefeuille</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xl font-extrabold tracking-wide text-white">{wallet.number}</p>
                <button
                  type="button"
                  onClick={copyNumber}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-neutral-800 px-3 py-2 text-xs font-bold text-neutral-200 transition-colors hover:bg-neutral-700"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">Donnez ce numéro pour recevoir de l'argent d'un autre utilisateur.</p>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#181818] p-4">
                <p className="text-[11px] font-semibold text-neutral-400">Solde en francs</p>
                <p className="mt-1 break-words text-lg font-extrabold text-orange-500">{formatMoney(wallet.balanceCDF, 'CDF')}</p>
              </div>
              <div className="rounded-2xl bg-[#181818] p-4">
                <p className="text-[11px] font-semibold text-neutral-400">Solde en dollars</p>
                <p className="mt-1 break-words text-lg font-extrabold text-orange-500">{formatMoney(wallet.balanceUSD, 'USD')}</p>
              </div>
            </section>

            <section className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => toggle('deposit')}
                aria-pressed={panel === 'deposit'}
                className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-xs font-bold text-white transition-colors ${panel === 'deposit' ? 'bg-[#9a3412]' : 'bg-[#c2410c] hover:bg-[#9a3412]'}`}
              >
                <ArrowDownToLine className="h-5 w-5" />
                Déposer
              </button>
              <button
                type="button"
                onClick={() => toggle('withdraw')}
                aria-pressed={panel === 'withdraw'}
                className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-xs font-bold text-white transition-colors ${panel === 'withdraw' ? 'bg-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                <ArrowUpFromLine className="h-5 w-5" />
                Retirer
              </button>
              <button
                type="button"
                onClick={() => toggle('transfer')}
                aria-pressed={panel === 'transfer'}
                className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-xs font-bold text-neutral-900 transition-colors ${panel === 'transfer' ? 'bg-neutral-300' : 'bg-neutral-100 hover:bg-white'}`}
              >
                <Send className="h-5 w-5" />
                Envoyer
              </button>
            </section>

            {panel && (
              <section className="space-y-4 rounded-2xl bg-[#181818] p-4">
                <h2 className="text-sm font-bold text-white">{PANEL_TITLE[panel]}</h2>
                {panel === 'deposit' && <DepositForm limits={wallet.limits} onChanged={refresh} />}
                {panel === 'withdraw' && <WithdrawForm wallet={wallet} onChanged={refresh} />}
                {panel === 'transfer' && <TransferForm wallet={wallet} onChanged={refresh} />}
              </section>
            )}

            <section className="rounded-2xl bg-[#181818] p-4">
              <h2 className="mb-1 text-sm font-bold text-white">Historique</h2>
              {txs.length === 0 ? (
                <p className="py-6 text-center text-xs text-neutral-500">Aucune opération pour le moment.</p>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {txs.map((tx) => (
                    <TxRow key={tx.id} tx={tx} />
                  ))}
                </ul>
              )}
              {nextCursor && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-2 w-full rounded-xl bg-neutral-800 py-2.5 text-xs font-bold text-neutral-200 transition-colors hover:bg-neutral-700 disabled:opacity-50"
                >
                  {loadingMore ? 'Chargement…' : 'Voir plus'}
                </button>
              )}
            </section>

            <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-neutral-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Soldes et montants vérifiés par nos serveurs</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}