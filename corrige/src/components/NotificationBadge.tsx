import React from 'react';

interface Props {
  count: number;
  /** alert = rouge (notifications non lues) ; new = vert (nouveautés). */
  tone?: 'alert' | 'new';
  /** Texte lu par les lecteurs d'écran, ex. « non lues ». */
  srLabel?: string;
  className?: string;
}

/** Pastille de compteur à placer dans un parent `relative`. N'affiche rien quand le compteur est 0. */
export default function NotificationBadge({ count, tone = 'alert', srLabel = 'non lues', className = '' }: Props) {
  if (!count || count < 1) return null;
  const text = count > 99 ? '99+' : String(count);
  const color = tone === 'alert' ? 'bg-[#F04438]' : 'bg-[#12B76A]';
  return (
    <span
      className={`pointer-events-none absolute -right-2 -top-1.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white ${color} ${className}`}
    >
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{`${count} ${srLabel}`}</span>
    </span>
  );
}
