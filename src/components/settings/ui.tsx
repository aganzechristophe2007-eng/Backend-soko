import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * Éléments d'interface communs aux écrans de paramètres.
 * Style : aplats de couleur franche, sans bordure, sans dégradé, sans halo.
 * Palette identique au reste de l'application (le mode sombre s'applique automatiquement).
 */

export const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-[#F2F4F7] ${className}`}>{children}</div>;
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-4">
      <h2 className="text-xl font-bold text-[#111111]">{title}</h2>
      {description && <p className="mt-1 text-sm text-[#667085]">{description}</p>}
    </header>
  );
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-6 px-1 text-xs font-bold uppercase tracking-wide text-[#667085] first:mt-0">{children}</h3>;
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:brightness-90 disabled:opacity-50 ${checked ? 'bg-[#FF6B00]' : 'bg-[#D0D5DD]'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#111111]">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-[#667085]">{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

/** Choix exclusif présenté en boutons (ex. « Tout le monde » / « Membres connectés »). */
export function ChoiceRow<T extends string>({
  title,
  description,
  value,
  options,
  onChange,
}: {
  title: string;
  description?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-sm font-semibold text-[#111111]">{title}</p>
      {description && <p className="mt-0.5 text-xs leading-relaxed text-[#667085]">{description}</p>}
      <div role="radiogroup" aria-label={title} className="mt-3 flex gap-1 rounded-xl bg-[#EAECF0] p-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={value === opt.id}
            onClick={() => onChange(opt.id)}
            className={`h-10 flex-1 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:brightness-90 ${value === opt.id ? 'bg-[#FF6B00] text-white' : 'text-[#344054] hover:bg-[#D0D5DD]'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const inputCls =
  'h-12 w-full rounded-xl bg-white px-3 text-sm text-[#111111] outline-none placeholder:text-[#98A2B3] focus:bg-[#FFF8F3] disabled:opacity-60';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-[#344054]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#667085]">{hint}</span>}
    </label>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean };

export function PrimaryButton({ busy, children, className = '', ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:brightness-90 disabled:opacity-60 ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function SecondaryButton({ busy, children, className = '', ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-[#EAECF0] px-5 text-sm font-bold text-[#111111] transition-colors hover:bg-[#D0D5DD] focus-visible:outline-none focus-visible:brightness-90 disabled:opacity-60 ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function DangerButton({ busy, children, className = '', ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:brightness-90 disabled:opacity-60 ${className}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const styles =
    tone === 'error'
      ? 'bg-red-50 text-red-700'
      : tone === 'success'
        ? 'bg-green-50 text-green-700'
        : 'bg-[#FFF1E7] text-[#C94F00]';
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${styles}`}>
      {tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-[#F2F4F7] p-4 text-sm text-[#667085]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </div>
  );
}
