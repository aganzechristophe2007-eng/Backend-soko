import React, { useCallback, useEffect, useState } from 'react';
import type { TourStep, UseGuidedTourOptions } from './types';
import TourOverlay from './TourOverlay';
import { findVisible } from './dom';
import { readTourStatus, writeTourStatus, markShownThisSession, wasShownThisSession } from './storage';

/**
 * Tutoriel guidé d'une page.
 *  - démarre automatiquement à la première visite (une fois la page prête) ;
 *  - mémorise « terminé » ou « passé » dans le navigateur ;
 *  - `start()` le relance à la demande (bouton Aide).
 * Ne bloque jamais la page : Passer / Échap ferment toujours le tutoriel.
 */
export function useGuidedTour({ tourId, steps, ready, autoStart = true }: UseGuidedTourOptions) {
  const [active, setActive] = useState<TourStep[] | null>(null);

  // Ne garde que les étapes dont la cible existe réellement et est visible à cet instant.
  const buildSteps = useCallback((): TourStep[] => {
    return steps.filter((s) => !s.target || !!findVisible(s.target));
  }, [steps]);

  const start = useCallback(() => {
    const available = buildSteps();
    if (available.length > 0) setActive(available);
  }, [buildSteps]);

  // Démarrage automatique : première visite uniquement, après un court délai pour laisser la mise en page se stabiliser.
  useEffect(() => {
    if (!autoStart || !ready || active) return;
    if (readTourStatus(tourId) || wasShownThisSession(tourId)) return;
    const timer = window.setTimeout(() => {
      if (readTourStatus(tourId) || wasShownThisSession(tourId)) return;
      markShownThisSession(tourId);
      start();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoStart, ready, active, tourId, start]);

  const finish = useCallback((status: 'done' | 'skipped') => {
    writeTourStatus(tourId, status);
    setActive(null);
  }, [tourId]);

  const element = active ? (
    <TourOverlay steps={active} onFinish={() => finish('done')} onSkip={() => finish('skipped')} />
  ) : null;

  return { start, isActive: !!active, element };
}
