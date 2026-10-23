import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Lock, User, Phone, Eye, EyeOff, Loader2, X, Check } from 'lucide-react';
import { apiFetch } from '../api/client';

type Mode = 'login' | 'register';

interface AuthSheetProps {
  onClose: () => void;
  onSuccess: (user: any, token: string) => void;
  showBackdrop?: boolean;
  initialMode?: Mode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ]{8,15}$/;
const MAX_ATTEMPTS = 5; // échecs consécutifs avant blocage local
const LOCK_SECONDS = 30;

function checkPassword(pw: string) {
  const length = pw.length >= 8 && pw.length <= 72;
  const letter = /[A-Za-z]/.test(pw);
  const digit = /\d/.test(pw);
  const bonus = pw.length >= 12 || /[^A-Za-z0-9]/.test(pw);
  const valid = length && letter && digit;
  const score = [length, letter, digit].filter(Boolean).length + (valid && bonus ? 1 : 0);
  return { length, letter, digit, valid, score };
}

const STRENGTH_LABELS = ['Trop faible', 'Trop faible', 'Trop faible', 'Correct', 'Solide'];
const STRENGTH_COLORS = ['bg-neutral-300', 'bg-red-600', 'bg-red-600', 'bg-orange-600', 'bg-green-700'];

const inputClass =
  'h-12 w-full rounded-xl border border-[#D0D5DD] bg-white pl-12 pr-4 text-base font-medium text-[#111827] placeholder:text-[#98A2B3] shadow-sm transition focus:border-[#FF6B00] focus:outline-none focus:ring-4 focus:ring-[#FF6B00]/10 disabled:opacity-60';

function Field({
  id,
  label,
  icon,
  right,
  hint,
  ...inputProps
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-black text-neutral-900">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-orange-700">{icon}</span>
        <input id={id} {...inputProps} className={`${inputClass} ${right ? 'pr-14' : ''}`} />
        {right && <span className="absolute right-3 top-1/2 -translate-y-1/2">{right}</span>}
      </div>
      {hint && <p className="mt-1.5 text-xs font-semibold text-neutral-600">{hint}</p>}
    </div>
  );
}

export default function AuthSheet({ onClose, onSuccess, showBackdrop = true, initialMode = 'login' }: AuthSheetProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [website, setWebsite] = useState(''); // honeypot anti-bot : doit rester vide
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const firstFieldRef = useRef<HTMLDivElement>(null);

  const isRegister = mode === 'register';
  const pw = useMemo(() => checkPassword(password), [password]);
  const locked = secondsLeft > 0;

  // Fermeture avec Échap + blocage du scroll de la page derrière le panneau
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !loading && onClose();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    if (showBackdrop) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, loading, showBackdrop]);

  // Compte à rebours après trop d'échecs
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  // Focus sur le premier champ à chaque changement de mode
  useEffect(() => {
    firstFieldRef.current?.querySelector('input')?.focus();
  }, [mode]);

  const switchMode = (next: Mode) => {
    if (loading || next === mode) return;
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
    setShowPw(false);
  };

  const validate = (): string => {
    if (isRegister && name.trim().length < 2) return 'Entrez votre nom (2 caractères minimum).';
    if (!EMAIL_RE.test(email.trim())) return 'Entrez une adresse email valide.';
    if (isRegister) {
      if (phone.trim() && !PHONE_RE.test(phone.trim())) return 'Numéro de téléphone invalide.';
      if (!pw.valid) return 'Le mot de passe doit contenir 8 caractères minimum, dont une lettre et un chiffre.';
      if (password !== confirm) return 'Les mots de passe ne correspondent pas.';
    } else if (!password) {
      return 'Entrez votre mot de passe.';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || locked) return;
    if (website) return; // un bot a rempli le champ caché : on ignore silencieusement

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = isRegister
        ? { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password }
        : { email: email.trim(), password };

      const res: any = await apiFetch(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = res?.data ?? res;

      if (!data?.success || !data?.user) {
        throw new Error(data?.error || data?.message || 'Une erreur est survenue.');
      }

      // Le token est dans un cookie HttpOnly : le JS ne le voit jamais.
      setPassword('');
      setConfirm('');
      setAttempts(0);
      onSuccess(data.user, '');
    } catch (err: any) {
      setError(err?.message || 'Impossible de se connecter au serveur. Vérifiez votre connexion.');
      setPassword('');
      setConfirm('');
      const next = attempts + 1;
      setAttempts(next);
      if (next >= MAX_ATTEMPTS) {
        setSecondsLeft(LOCK_SECONDS);
        setAttempts(0);
      }
    } finally {
      setLoading(false);
    }
  };

  const eyeButton = (
    <button
      type="button"
      onClick={() => setShowPw((v) => !v)}
      aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-700 hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
    >
      {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  );

  const sheet = (
    <div
      role="dialog"
      aria-modal={showBackdrop}
      aria-labelledby="auth-title"
      className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#EAECF0] bg-white p-5 text-[#111827] shadow-[0_18px_60px_rgba(16,24,40,0.16)] sm:p-7 md:rounded-3xl"
    >
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        aria-label="Fermer"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#667085] transition hover:border-[#FF6B00] hover:text-[#FF6B00] disabled:opacity-60"
      >
        <X className="h-4 w-4" />
      </button>

      <h2 id="auth-title" className="pr-12 text-2xl font-black tracking-tight">
        {isRegister ? 'Créer un compte' : 'Se connecter'}
      </h2>

      <div role="tablist" className="mt-4 grid grid-cols-2 gap-2">
        {(['login', 'register'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`h-11 rounded-xl border text-sm font-semibold transition ${
              mode === m ? 'border-[#FF6B00] bg-[#FFF1E7] text-[#C94F00]' : 'border-[#EAECF0] bg-white text-[#475467] hover:border-[#D0D5DD] hover:bg-[#F9FAFB]'
            }`}
          >
            {m === 'login' ? 'Connexion' : 'Inscription'}
          </button>
        ))}
      </div>

      <div aria-live="assertive" className="mt-4 empty:hidden">
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"
          >
            {error}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate autoComplete="on" className="mt-4 space-y-4">
        {/* Honeypot : invisible pour les humains */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Ne pas remplir</label>
          <input id="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        {isRegister && (
          <div ref={firstFieldRef}>
            <Field
              id="name"
              label="Nom complet"
              icon={<User className="h-5 w-5" />}
              type="text"
              name="name"
              autoComplete="name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Votre nom"
              disabled={loading}
            />
          </div>
        )}

        <div ref={isRegister ? undefined : firstFieldRef}>
          <Field
            id="email"
            label="Adresse email"
            icon={<Mail className="h-5 w-5" />}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@exemple.com"
            disabled={loading}
          />
        </div>

        {isRegister && (
          <Field
            id="phone"
            label="Téléphone (facultatif)"
            icon={<Phone className="h-5 w-5" />}
            type="tel"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            maxLength={16}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+243 ..."
            disabled={loading}
          />
        )}

        <Field
          id="password"
          label="Mot de passe"
          icon={<Lock className="h-5 w-5" />}
          right={eyeButton}
          type={showPw ? 'text' : 'password'}
          name="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          maxLength={72}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyUp={(e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)}
          onBlur={() => setCapsLock(false)}
          placeholder={isRegister ? 'Créez un mot de passe' : 'Votre mot de passe'}
          disabled={loading}
          hint={capsLock ? 'Verr. Maj. activé.' : undefined}
        />

        {isRegister && (
          <>
            <div aria-live="polite">
              <div className="flex gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full border border-[#EAECF0] ${
                      password && pw.score >= i ? STRENGTH_COLORS[pw.score] : 'bg-white'
                    }`}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-xs font-bold text-neutral-700">
                {password ? STRENGTH_LABELS[pw.score] : 'Minimum 8 caractères, avec une lettre et un chiffre.'}
              </p>
              {password && (
                <ul className="mt-1 space-y-0.5 text-xs font-semibold">
                  {[
                    [pw.length, '8 à 72 caractères'],
                    [pw.letter, 'Au moins une lettre'],
                    [pw.digit, 'Au moins un chiffre'],
                  ].map(([ok, text]) => (
                    <li key={text as string} className={ok ? 'text-green-700' : 'text-neutral-600'}>
                      <Check className={`mr-1 inline h-3.5 w-3.5 ${ok ? '' : 'opacity-30'}`} />
                      {text as string}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Field
              id="confirm"
              label="Confirmer le mot de passe"
              icon={<Lock className="h-5 w-5" />}
              type={showPw ? 'text' : 'password'}
              name="confirm"
              autoComplete="new-password"
              maxLength={72}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Répétez le mot de passe"
              disabled={loading}
            />
          </>
        )}

        <button
          type="submit"
          disabled={loading || locked}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-[#FF6B00] text-sm font-bold text-white shadow-sm transition hover:bg-[#E85F00] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Chargement" />
          ) : locked ? (
            <span>Réessayez dans {secondsLeft} s</span>
          ) : (
            <span>{isRegister ? 'Créer mon compte' : 'Se connecter'}</span>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-sm font-medium text-[#667085]">
        {isRegister ? 'Déjà un compte ? ' : 'Pas encore de compte ? '}
        <button
          type="button"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
          className="font-semibold text-[#E85F00] underline-offset-4 hover:underline"
        >
          {isRegister ? 'Se connecter' : "S'inscrire"}
        </button>
      </p>
    </div>
  );

  if (!showBackdrop) {
    return <div className="flex w-full justify-center">{sheet}</div>;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/70 md:items-center md:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      {sheet}
    </div>
  );
}