import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, Check, MousePointerClick } from 'lucide-react';
import type { TourStep } from './types';
import { findVisible, prefersReducedMotion } from './dom';

interface Props {
  steps: TourStep[];
  onFinish: () => void;
  onSkip: () => void;
}

interface Box { top: number; left: number; width: number; height: number }

const PAD = 8;
const GAP = 14;
const MARGIN = 12;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

export default function TourOverlay({ steps, onFinish, onSkip }: Props) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [cardSize, setCardSize] = useState({ w: 320, h: 180 });
  const [direction, setDirection] = useState<1 | -1>(1);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const reduced = useRef(prefersReducedMotion()).current;

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const isFirst = index === 0;

  const goTo = useCallback((next: number, dir: 1 | -1) => {
    setDirection(dir);
    setIndex(next);
  }, []);
  const next = useCallback(() => (isLast ? onFinish() : goTo(index + 1, 1)), [isLast, onFinish, goTo, index]);
  const prev = useCallback(() => { if (!isFirst) goTo(index - 1, -1); }, [isFirst, goTo, index]);

  // Cible disparue entre-temps (ex. liste vidée) : on saute l'étape dans le sens du déplacement, sans bloquer.
  useEffect(() => {
    if (!step.target) return;
    if (findVisible(step.target)) return;
    const t = window.setTimeout(() => {
      if (step.target && findVisible(step.target)) return;
      if (direction === 1) (isLast ? onFinish() : goTo(index + 1, 1));
      else if (!isFirst) goTo(index - 1, -1);
      else goTo(index + 1, 1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [step, direction, isLast, isFirst, index, goTo, onFinish]);

  // Amène la cible dans la zone visible au changement d'étape.
  useEffect(() => {
    if (!step.target) { setBox(null); return; }
    const el = findVisible(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const fits = r.top >= 70 && r.bottom <= window.innerHeight - 70;
    if (!fits) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [step, reduced]);

  // Suit la cible en continu (défilement, redimensionnement, animations de mise en page).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setVp((p) => (p.w !== window.innerWidth || p.h !== window.innerHeight ? { w: window.innerWidth, h: window.innerHeight } : p));
      if (step.target) {
        const el = findVisible(step.target);
        if (el) {
          const r = el.getBoundingClientRect();
          setBox((b) => {
            const nb = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
            return b && Math.abs(b.top - nb.top) < 0.5 && Math.abs(b.left - nb.left) < 0.5 && Math.abs(b.width - nb.width) < 0.5 && Math.abs(b.height - nb.height) < 0.5 ? b : nb;
          });
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [step]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCardSize((s) => (Math.abs(s.w - r.width) > 1 || Math.abs(s.h - r.height) > 1 ? { w: r.width, h: r.height } : s));
  }, [index, vp.w, box?.width]);

  // Attend l'action réelle de l'utilisateur sur la cible (clic), sans jamais l'empêcher.
  useEffect(() => {
    if (step.waitFor !== 'click' || !step.target) return;
    const sel = step.target;
    const handler = (e: Event) => {
      const el = findVisible(sel);
      if (el && e.target instanceof Node && el.contains(e.target)) {
        window.setTimeout(() => { if (isLast) onFinish(); else goTo(index + 1, 1); }, 350);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [step, isLast, index, goTo, onFinish]);

  // Clavier : Échap = passer, flèches = naviguer. Le focus reste dans l'infobulle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onSkip(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onSkip]);

  useEffect(() => {
    const el = cardRef.current?.querySelector<HTMLElement>('[data-tour-primary]');
    el?.focus({ preventScroll: true });
  }, [index]);

  /* ----------------------------- Positionnement ----------------------------- */
  const isMobile = vp.w < 640;
  const cardW = Math.min(isMobile ? vp.w - MARGIN * 2 : 360, vp.w - MARGIN * 2);
  const hasTarget = !!step.target && !!box;

  let cardStyle: React.CSSProperties;
  let placement: 'top' | 'bottom' | 'center' | 'dock' = 'center';

  if (!hasTarget) {
    cardStyle = { left: (vp.w - cardW) / 2, top: Math.max(MARGIN, (vp.h - cardSize.h) / 2), width: cardW };
  } else {
    const b = box as Box;
    const spaceBelow = vp.h - (b.top + b.height) - GAP - MARGIN;
    const spaceAbove = b.top - GAP - MARGIN;
    const wantsTop = step.placement === 'top';
    const wantsBottom = step.placement === 'bottom';
    if (!wantsTop && (wantsBottom || spaceBelow >= cardSize.h || spaceBelow >= spaceAbove) && spaceBelow >= cardSize.h) placement = 'bottom';
    else if (spaceAbove >= cardSize.h) placement = 'top';
    else placement = 'dock'; // cible trop grande : l'infobulle s'ancre en bas de l'écran
    const left = clamp(b.left + b.width / 2 - cardW / 2, MARGIN, vp.w - cardW - MARGIN);
    if (placement === 'bottom') cardStyle = { left, top: b.top + b.height + GAP, width: cardW };
    else if (placement === 'top') cardStyle = { left, top: b.top - GAP - cardSize.h, width: cardW };
    else cardStyle = { left: (vp.w - cardW) / 2, top: Math.max(MARGIN, vp.h - cardSize.h - MARGIN), width: cardW };
  }

  // Pointe du curseur : vers le bas-centre de la cible. En mode « dock », on évite de masquer la carte.
  let cursor: { x: number; y: number } | null = null;
  if (hasTarget) {
    const b = box as Box;
    cursor = { x: clamp(b.left + b.width / 2 + Math.min(b.width * 0.12, 16), 8, vp.w - 8), y: clamp(b.top + b.height * 0.62, 8, vp.h - 8) };
  }

  const waiting = step.waitFor === 'click';
  const trans = reduced ? 'none' : 'all 320ms cubic-bezier(0.22, 1, 0.36, 1)';

  const node = (
    <div className="cbf-tour-root" style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
      <style>{`
        @keyframes cbf-tour-tap { 0%,100% { transform: scale(0.6); opacity: 0.0 } 35% { opacity: .55 } 70% { transform: scale(1.5); opacity: 0 } }
        @keyframes cbf-tour-bob { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-3px,-5px) } }
        @keyframes cbf-tour-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .cbf-tour-anim { animation: none !important } }
      `}</style>

      {/* Fond assombri. Pendant une étape « à vous de jouer », il laisse passer les clics : la page reste utilisable. */}
      <div
        onClick={waiting ? undefined : (e) => e.stopPropagation()}
        style={{ position: 'fixed', inset: 0, pointerEvents: hasTarget && waiting ? 'none' : 'auto', background: hasTarget ? 'transparent' : 'rgba(16,24,40,0.62)' }}
        aria-hidden="true"
      />
      {hasTarget && box && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(16,24,40,0.62), 0 0 0 2px #FF6B00, 0 0 0 6px rgba(255,107,0,0.28)',
            transition: trans, pointerEvents: 'none',
          }}
        />
      )}
      {/* Les clics sur l'élément en surbrillance restent autorisés pendant l'attente ; sinon on les bloque pour ne pas déclencher l'action par erreur. */}
      {hasTarget && box && !waiting && (
        <div style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height, pointerEvents: 'auto', cursor: 'default' }} onClick={(e) => e.stopPropagation()} aria-hidden="true" />
      )}

      {/* Curseur animé */}
      {cursor && placement !== 'dock' && (
        <div aria-hidden="true" style={{ position: 'fixed', left: cursor.x, top: cursor.y, transition: trans, pointerEvents: 'none', zIndex: 2 }}>
          <span className="cbf-tour-anim" style={{ position: 'absolute', left: -18, top: -18, width: 36, height: 36, borderRadius: '9999px', background: '#FF6B00', animation: waiting ? 'cbf-tour-tap 1.4s ease-out infinite' : 'none', opacity: waiting ? undefined : 0 }} />
          <svg className="cbf-tour-anim" width="30" height="30" viewBox="0 0 24 24" style={{ position: 'absolute', left: -3, top: -3, filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.35))', animation: 'cbf-tour-bob 1.4s ease-in-out infinite' }}>
            <path d="M5 3l14 7.5-6.2 1.9L9.9 19 5 3z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Infobulle */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="cbf-tour-title"
        aria-describedby="cbf-tour-body"
        key={step.id}
        style={{ position: 'fixed', ...cardStyle, pointerEvents: 'auto', transition: reduced ? 'none' : 'top 320ms cubic-bezier(0.22,1,0.36,1), left 320ms cubic-bezier(0.22,1,0.36,1)', animation: reduced ? 'none' : 'cbf-tour-in 240ms ease-out', zIndex: 3 }}
        className="rounded-2xl border border-[#EAECF0] bg-white p-4 text-[#111111] shadow-[0_20px_50px_rgba(16,24,40,0.28)]"
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FF6B00]">Étape {index + 1} sur {steps.length}</p>
          <button type="button" onClick={onSkip} aria-label="Fermer le tutoriel" className="-m-1 flex h-7 w-7 items-center justify-center rounded-full text-[#667085] hover:bg-[#F2F4F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <h2 id="cbf-tour-title" className="text-base font-bold leading-snug">{step.title}</h2>
        <p id="cbf-tour-body" className="mt-1 text-sm leading-relaxed text-[#475467]">{step.body}</p>
        {step.actionHint && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-[#FFF1E7] px-2.5 py-1.5 text-xs font-medium text-[#B54708]">
            <MousePointerClick className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span>{step.actionHint}</span>
          </p>
        )}

        <div className="mt-3 flex items-center gap-1" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} className="h-1.5 rounded-full transition-all" style={{ width: i === index ? 18 : 6, background: i <= index ? '#FF6B00' : '#E4E7EC' }} />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={onSkip} className="rounded-lg px-2 py-2 text-xs font-semibold text-[#667085] hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
            Passer
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button type="button" onClick={prev} className="inline-flex items-center gap-1 rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-semibold hover:border-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Précédent
              </button>
            )}
            <button type="button" data-tour-primary onClick={next} className="inline-flex items-center gap-1 rounded-lg bg-[#FF6B00] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2">
              {isLast ? (<><Check className="h-3.5 w-3.5" aria-hidden="true" /> Terminer</>) : (<>Suivant <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
