import React from 'react';
import { HelpCircle } from 'lucide-react';

interface Props {
  onClick: () => void;
  /** Classes du bouton : passer celles de l'en-tête de la page pour garder la cohérence visuelle. */
  className?: string;
  dark?: boolean;
}

/** Bouton « Aide » : relance le tutoriel de la page à tout moment. */
export default function TourHelpButton({ onClick, className, dark }: Props) {
  const base = dark
    ? 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-orange-500 hover:text-orange-500'
    : 'border-[#EAECF0] bg-white text-[#344054] hover:border-[#FF6B00] hover:text-[#FF6B00]';
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour="help"
      aria-label="Aide : revoir le tutoriel de cette page"
      title="Revoir le tutoriel"
      className={className || `inline-flex h-10 flex-shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] ${base}`}
    >
      <HelpCircle className="h-[18px] w-[18px]" aria-hidden="true" />
      <span className="hidden sm:inline">Aide</span>
    </button>
  );
}
