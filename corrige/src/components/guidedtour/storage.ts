const PREFIX = 'cbfsoko-tour:v1:';

export type TourStatus = 'done' | 'skipped';

export function readTourStatus(tourId: string): TourStatus | null {
  try {
    const v = window.localStorage.getItem(PREFIX + tourId);
    return v === 'done' || v === 'skipped' ? v : null;
  } catch {
    return null; // stockage indisponible (navigation privée...) : on traitera comme « jamais vu » pour la session
  }
}

export function writeTourStatus(tourId: string, status: TourStatus): void {
  try {
    window.localStorage.setItem(PREFIX + tourId, status);
  } catch {
    /* ignoré : le tutoriel pourra se réafficher, sans conséquence */
  }
}

export function clearTourStatus(tourId: string): void {
  try {
    window.localStorage.removeItem(PREFIX + tourId);
  } catch {
    /* ignoré */
  }
}

// Évite de relancer automatiquement plusieurs fois dans la même session si le stockage est bloqué.
const shownThisSession = new Set<string>();
export const markShownThisSession = (id: string) => shownThisSession.add(id);
export const wasShownThisSession = (id: string) => shownThisSession.has(id);
