import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------------------------------------------ */
/*  Tutoriel guidé : overlay + spotlight + infobulle + main animée    */
/*  Les étapes pointent vers de VRAIS éléments via [data-tour="..."]. */
/*  Une étape dont l'élément n'existe pas (ex. bouton absent) est     */
/*  ignorée automatiquement.                                          */
/* ------------------------------------------------------------------ */

export interface TourStep {
  id: string;
  /** Valeur de l'attribut data-tour de l'élément à mettre en évidence. Absent = carte centrée. */
  target?: string;
  title: string;
  body: string;
  /** Position préférée de l'infobulle (par défaut : automatique selon la place disponible). */
  placement?: 'auto' | 'top' | 'bottom';
  /** L'utilisateur peut réaliser l'action : le tutoriel avance dès qu'elle est faite (« Suivant » reste disponible). */
  action?: { type: 'click' | 'input'; hint: string };
}

export type TourStatus = 'done' | 'skipped';

/* ----------------------------- Mémorisation ----------------------------- */

const storageKey = (tourId: string) => `cbfsoko:tour:${tourId}:v1`;

export function readTourStatus(tourId: string): TourStatus | null {
  try {
    const value = window.localStorage.getItem(storageKey(tourId));
    return value === 'done' || value === 'skipped' ? value : null;
  } catch {
    return null; // stockage indisponible (navigation privée…) : on considère le tutoriel comme non vu
  }
}

function writeTourStatus(tourId: string, status: TourStatus) {
  try {
    window.localStorage.setItem(storageKey(tourId), status);
  } catch {
    /* stockage indisponible : le tutoriel pourra se réafficher, sans conséquence */
  }
}

export function resetTourStatus(tourId: string) {
  try {
    window.localStorage.removeItem(storageKey(tourId));
  } catch {
    /* rien à faire */
  }
}

/* ------------------------------ Utilitaires ------------------------------ */

const STYLE_ID = 'cbfsoko-tour-css';
const CSS = `
@keyframes cbf-tour-tap { 0%,100% { transform: translate(0,0) } 50% { transform: translate(5px,7px) } }
@keyframes cbf-tour-ripple { 0% { transform: scale(.3); opacity: .8 } 100% { transform: scale(1.6); opacity: 0 } }
@keyframes cbf-tour-pulse { 0%,100% { box-shadow: 0 0 0 3px rgba(255,107,0,.35) } 50% { box-shadow: 0 0 0 8px rgba(255,107,0,.12) } }
@keyframes cbf-tour-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.cbf-tour-hand { animation: cbf-tour-tap 1.2s ease-in-out infinite; }
.cbf-tour-ripple { animation: cbf-tour-ripple 1.2s ease-out infinite; }
.cbf-tour-ring { animation: cbf-tour-pulse 1.8s ease-in-out infinite; }
.cbf-tour-card { animation: cbf-tour-in .22s ease-out both; }
.cbf-tour-btn { font: inherit; cursor: pointer; border-radius: 9999px; padding: 9px 16px; font-size: 13px; font-weight: 700; line-height: 1; min-height: 38px; }
.cbf-tour-btn:focus-visible { outline: 2px solid #FF6B00; outline-offset: 2px; }
.cbf-tour-help { position: fixed; right: 16px; bottom: 16px; z-index: 9000; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #EAECF0; background: #fff; color: #111; border-radius: 9999px; padding: 0 14px 0 6px; height: 44px; font: inherit; font-size: 13px; font-weight: 700; box-shadow: 0 6px 20px rgba(16,24,40,.18); cursor: pointer; }
.cbf-tour-help:hover { border-color: #FF6B00; color: #FF6B00; }
.cbf-tour-help:focus-visible { outline: 2px solid #FF6B00; outline-offset: 2px; }
@media (max-width: 480px) { .cbf-tour-help { padding: 0 6px; width: 44px; justify-content: center; } .cbf-tour-help span.cbf-label { display: none; } }
@media (prefers-reduced-motion: reduce) {
  .cbf-tour-hand, .cbf-tour-ripple, .cbf-tour-ring, .cbf-tour-card { animation: none !important; }
  .cbf-tour-dim { transition: none !important; }
}
`;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/** Premier élément visible portant data-tour="name" (les éléments masqués par CSS sont ignorés). */
export function findTourTarget(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const node of Array.from(nodes)) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
}

interface Box {
  has: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  vw: number;
  vh: number;
}

const EMPTY_BOX: Box = { has: false, x: 0, y: 0, w: 0, h: 0, vw: 1024, vh: 768 };
const PAD = 8;
const DIM = 'rgba(10,10,15,0.66)';

/* ------------------------------- Overlay ------------------------------- */

interface OverlayProps {
  steps: TourStep[];
  index: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onDone: () => void;
  directionRef: React.MutableRefObject<1 | -1>;
}

function TourOverlay({ steps, index, onNext, onPrev, onSkip, onDone, directionRef }: OverlayProps) {
  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const reduced = usePrefersReducedMotion();

  const [el, setEl] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box>(EMPTY_BOX);
  const [tipH, setTipH] = useState(200);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { ensureStyles(); }, []);

  // 1) Localise l'élément réel de l'étape (il peut apparaître avec un léger retard : chargement, scroll…)
  useEffect(() => {
    setEl(null);
    const target = step.target;
    if (!target) return;
    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      if (cancelled) return;
      const found = findTourTarget(target);
      if (found) {
        setEl(found);
        const r = found.getBoundingClientRect();
        const vh = window.innerHeight;
        if (r.top < 72 || r.bottom > vh - 24) {
          found.scrollIntoView({ block: r.height > vh * 0.6 ? 'start' : 'center', behavior: reduced ? 'auto' : 'smooth' });
        }
        return;
      }
      tries += 1;
      if (tries > 15) {
        // L'élément n'existe pas : on saute l'étape plutôt que de pointer dans le vide.
        if (directionRef.current < 0 && !isFirst) onPrev();
        else if (isLast) onDone();
        else onNext();
        return;
      }
      timer = setTimeout(look, 100);
    };
    timer = setTimeout(look, 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  // 2) Suit la position de l'élément (scroll, redimensionnement, animations, rotation du téléphone)
  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let next: Box = { ...EMPTY_BOX, vw, vh };
      if (el) {
        if (!el.isConnected && step.target) {
          const again = findTourTarget(step.target);
          if (again) setEl(again);
        } else {
          const r = el.getBoundingClientRect();
          next = { has: true, x: r.left, y: r.top, w: r.width, h: r.height, vw, vh };
        }
      }
      const key = `${next.has}|${Math.round(next.x)}|${Math.round(next.y)}|${Math.round(next.w)}|${Math.round(next.h)}|${vw}|${vh}`;
      if (key !== last) { last = key; setBox(next); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, step.id]);

  // 3) Étape « action » : avance quand l'utilisateur fait réellement l'action sur l'élément
  useEffect(() => {
    const action = step.action;
    if (!action || !el) return;
    let timer: ReturnType<typeof setTimeout>;
    const eventName = action.type === 'click' ? 'click' : 'input';
    const handler = (event: Event) => {
      const node = event.target as Node | null;
      if (!node || !el.contains(node)) return;
      if (action.type === 'input' && !(event.target as HTMLInputElement).value) return;
      clearTimeout(timer);
      timer = setTimeout(() => (isLast ? onDone() : onNext()), action.type === 'input' ? 1000 : 500);
    };
    document.addEventListener(eventName, handler, true);
    return () => { document.removeEventListener(eventName, handler, true); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, step.id]);

  // 4) Clavier : Échap = passer, flèches = naviguer (sauf pendant la saisie)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onSkip(); return; }
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.key === 'ArrowRight') { event.preventDefault(); isLast ? onDone() : onNext(); }
      if (event.key === 'ArrowLeft' && !isFirst) { event.preventDefault(); onPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // 5) Focus clavier sur le bouton principal (sauf quand l'utilisateur doit agir sur la page)
  useEffect(() => {
    if (!step.action) primaryRef.current?.focus({ preventScroll: true });
  }, [step.id, step.action]);

  useLayoutEffect(() => {
    const h = tipRef.current?.offsetHeight;
    if (h && Math.abs(h - tipH) > 1) setTipH(h);
  });

  const { vw, vh } = box;
  const hasHole = box.has && !!step.target;
  const hx0 = Math.max(0, box.x - PAD);
  const hy0 = Math.max(0, box.y - PAD);
  const hx1 = Math.min(vw, box.x + box.w + PAD);
  const hy1 = Math.min(vh, box.y + box.h + PAD);
  const holeVisible = hasHole && hx1 > hx0 && hy1 > hy0;
  const hw = hx1 - hx0;
  const hh = hy1 - hy0;
  const transition = reduced ? 'none' : 'all .22s ease';

  // Infobulle : au-dessus ou en dessous de l'élément selon la place, toujours dans l'écran
  const tipW = Math.min(340, vw - 24);
  let tipLeft = Math.round((vw - tipW) / 2);
  let tipTop = Math.round((vh - tipH) / 2);
  if (holeVisible) {
    const gap = 18;
    const below = vh - hy1 - gap;
    const above = hy0 - gap;
    let place: 'top' | 'bottom' = below >= tipH || below >= above ? 'bottom' : 'top';
    if (step.placement === 'top' && above >= tipH) place = 'top';
    if (step.placement === 'bottom' && below >= tipH) place = 'bottom';
    tipLeft = Math.round(Math.min(Math.max(12, hx0 + hw / 2 - tipW / 2), vw - tipW - 12));
    tipTop = place === 'bottom' ? hy1 + gap : hy0 - gap - tipH;
    if (Math.max(below, above) < tipH) tipTop = vh - tipH - 12; // élément très grand : bandeau en bas de l'écran
    tipTop = Math.round(Math.min(Math.max(8, tipTop), vh - tipH - 8));
  }

  // Main : la pointe de l'index est dans l'élément (viewBox 24 -> 44 px : pointe en (19, 7))
  const handX = holeVisible ? Math.round(Math.min(Math.max(hx0 + 14, hx0 + hw * 0.55), hx1 - 14)) : 0;
  const handY = holeVisible ? Math.round(Math.min(hy0 + Math.min(hh * 0.5, 60), vh - 40)) : 0;

  const progress = useMemo(() => steps.map((_, i) => i), [steps]);
  const titleId = `cbf-tour-title-${step.id}`;
  const dimStyle: React.CSSProperties = { position: 'fixed', background: DIM, transition, zIndex: 9998 };

  const overlay = (
    <div data-tour-root="" style={{ position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none' }}>
      {holeVisible ? (
        <>
          {/* 4 panneaux autour de l'élément : l'élément reste réellement cliquable */}
          <div className="cbf-tour-dim" style={{ ...dimStyle, left: 0, top: 0, width: vw, height: hy0, pointerEvents: 'auto' }} onClick={() => undefined} />
          <div className="cbf-tour-dim" style={{ ...dimStyle, left: 0, top: hy1, width: vw, height: Math.max(0, vh - hy1), pointerEvents: 'auto' }} />
          <div className="cbf-tour-dim" style={{ ...dimStyle, left: 0, top: hy0, width: hx0, height: hh, pointerEvents: 'auto' }} />
          <div className="cbf-tour-dim" style={{ ...dimStyle, left: hx1, top: hy0, width: Math.max(0, vw - hx1), height: hh, pointerEvents: 'auto' }} />
          {!step.action && (
            // Étape d'explication : on évite un clic accidentel sur l'élément
            <div style={{ position: 'fixed', left: hx0, top: hy0, width: hw, height: hh, pointerEvents: 'auto', zIndex: 9998 }} />
          )}
          <div
            className="cbf-tour-ring"
            style={{ position: 'fixed', left: hx0, top: hy0, width: hw, height: hh, borderRadius: 14, border: '2px solid #FF6B00', pointerEvents: 'none', transition, zIndex: 9998 }}
          />
        </>
      ) : (
        <div className="cbf-tour-dim" style={{ ...dimStyle, left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'auto' }} />
      )}

      {holeVisible && (
        <div aria-hidden="true" style={{ position: 'fixed', left: handX - 19, top: handY - 7, width: 44, height: 44, pointerEvents: 'none', zIndex: 9999, transition }}>
          {step.action && (
            <span className="cbf-tour-ripple" style={{ position: 'absolute', left: 19 - 18, top: 7 - 18, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,107,0,.45)' }} />
          )}
          <svg className="cbf-tour-hand" width="44" height="44" viewBox="0 0 24 24" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.35))' }}>
            <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0 0V8.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4 14.5a1.6 1.6 0 0 1 2.6-1.8L9 15" />
          </svg>
        </div>
      )}

      {(!step.target || holeVisible) && (
        <div
          ref={tipRef}
          className="cbf-tour-card"
          role="dialog"
          aria-labelledby={titleId}
          aria-live="polite"
          style={{
            position: 'fixed', left: tipLeft, top: tipTop, width: tipW, zIndex: 10000, pointerEvents: 'auto',
            background: '#fff', color: '#111', borderRadius: 18, padding: '16px 16px 14px', boxShadow: '0 18px 50px rgba(0,0,0,.35)',
            fontFamily: 'inherit', boxSizing: 'border-box', border: '1px solid #EAECF0', transition,
          }}
        >
          <button
            type="button"
            onClick={onSkip}
            aria-label="Fermer le tutoriel"
            style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, border: 0, background: 'transparent', color: '#667085', fontSize: 20, lineHeight: 1, cursor: 'pointer', borderRadius: 9999 }}
          >
            ×
          </button>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#FF6B00' }}>
            Étape {index + 1} sur {steps.length}
          </p>
          <h2 id={titleId} style={{ margin: '4px 28px 6px 0', fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{step.title}</h2>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: '#344054' }}>{step.body}</p>
          {step.action && (
            <p style={{ margin: '10px 0 0', padding: '8px 10px', borderRadius: 10, background: '#FFF1E7', color: '#B54708', fontSize: 12.5, fontWeight: 700, lineHeight: 1.4 }}>
              👉 À vous : {step.action.hint}
            </p>
          )}
          <div aria-hidden="true" style={{ display: 'flex', gap: 5, margin: '12px 0 12px' }}>
            {progress.map((i) => (
              <span key={i} style={{ height: 5, flex: i === index ? 2 : 1, borderRadius: 9999, background: i <= index ? '#FF6B00' : '#EAECF0', transition }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!isLast && (
              <button type="button" className="cbf-tour-btn" onClick={onSkip} style={{ border: 0, background: 'transparent', color: '#667085', paddingLeft: 4, paddingRight: 8 }}>
                Passer
              </button>
            )}
            <span style={{ flex: 1 }} />
            {!isFirst && (
              <button type="button" className="cbf-tour-btn" onClick={onPrev} style={{ border: '1px solid #D0D5DD', background: '#fff', color: '#111' }}>
                Précédent
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              className="cbf-tour-btn"
              onClick={isLast ? onDone : onNext}
              style={{ border: 0, background: '#FF6B00', color: '#fff' }}
            >
              {isLast ? 'Terminer' : 'Suivant'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

/* --------------------------------- Hook --------------------------------- */

export interface UseGuidedTourOptions {
  /** Identifiant unique du tutoriel (une clé de mémorisation par page). */
  id: string;
  steps: TourStep[];
  /** La page est prête (données chargées, éléments rendus) : le tutoriel automatique peut démarrer. */
  ready: boolean;
  /** Démarre tout seul à la première visite (défaut : true). */
  autoStart?: boolean;
}

export function useGuidedTour({ id, steps, ready, autoStart = true }: UseGuidedTourOptions) {
  const [run, setRun] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const directionRef = useRef<1 | -1>(1);
  const autoStartedRef = useRef(false);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const start = useCallback(() => {
    // On ne garde que les étapes dont l'élément existe réellement sur la page à cet instant.
    const available = stepsRef.current.filter((s) => !s.target || findTourTarget(s.target));
    if (available.length === 0) return;
    directionRef.current = 1;
    setIndex(0);
    setRun(available);
  }, []);

  const finish = useCallback((status: TourStatus) => {
    writeTourStatus(id, status);
    setRun(null);
    setIndex(0);
  }, [id]);

  useEffect(() => {
    if (!ready || !autoStart || autoStartedRef.current || readTourStatus(id)) return;
    const timer = setTimeout(() => {
      autoStartedRef.current = true;
      start();
    }, 900);
    return () => clearTimeout(timer);
  }, [ready, autoStart, id, start]);

  const onNext = useCallback(() => { directionRef.current = 1; setIndex((i) => i + 1); }, []);
  const onPrev = useCallback(() => { directionRef.current = -1; setIndex((i) => Math.max(0, i - 1)); }, []);
  const onSkip = useCallback(() => finish('skipped'), [finish]);
  const onDone = useCallback(() => finish('done'), [finish]);

  const active = run !== null;
  const tour =
    run && run[index] ? (
      <TourOverlay steps={run} index={index} onNext={onNext} onPrev={onPrev} onSkip={onSkip} onDone={onDone} directionRef={directionRef} />
    ) : null;

  return { active, start, tour };
}

/* --------------------------- Bouton « Aide » --------------------------- */

export function TourHelpButton({ onClick, hidden }: { onClick: () => void; hidden?: boolean }) {
  useEffect(() => { ensureStyles(); }, []);
  if (hidden) return null;
  return (
    <button type="button" className="cbf-tour-help" onClick={onClick} data-tour="tour-help" aria-label="Aide : revoir le tutoriel" title="Revoir le tutoriel">
      <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: '50%', background: '#FF6B00', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800 }}>?</span>
      <span className="cbf-label">Aide</span>
    </button>
  );
}
