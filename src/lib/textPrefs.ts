// Préférences globales de lecture (taille du texte + police), dans le même esprit que le
// fond d'écran personnalisé : stockées en localStorage, appliquées sur <html>, synchronisées
// entre les pages/onglets via un événement custom (voir 'storage-bg-change' dans Home.tsx).

export const TEXT_SIZE_OPTIONS = [
  { id: 'sm', label: 'Petit', px: 14 },
  { id: 'md', label: 'Normal', px: 16 },
  { id: 'lg', label: 'Grand', px: 18 },
] as const;

export const FONT_FAMILY_OPTIONS = [
  { id: 'system', label: 'Système', value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { id: 'rounded', label: 'Arrondie', value: "'Nunito', 'Quicksand', 'Segoe UI Rounded', sans-serif" },
  { id: 'serif', label: 'Classique', value: "Georgia, 'Times New Roman', serif" },
] as const;

const SIZE_KEY = 'cbfsoko-text-size';
const FAMILY_KEY = 'cbfsoko-text-family';
const DEFAULT_SIZE_PX = 16;
const DEFAULT_FAMILY = FONT_FAMILY_OPTIONS[0].value;

export const TEXT_PREF_EVENT = 'storage-text-change';

export function readSavedTextSize(): number {
  const saved = Number(localStorage.getItem(SIZE_KEY));
  return TEXT_SIZE_OPTIONS.some((o) => o.px === saved) ? saved : DEFAULT_SIZE_PX;
}

export function readSavedTextFamily(): string {
  return localStorage.getItem(FAMILY_KEY) || DEFAULT_FAMILY;
}

// Applique immédiatement (sans sauvegarder) — utile pour resynchroniser une page déjà ouverte.
export function applyTextPrefs(sizePx: number, family: string) {
  document.documentElement.style.fontSize = `${sizePx}px`;
  document.documentElement.style.setProperty('--app-font-family', family);
  document.body.style.fontFamily = family;
}

// Sauvegarde + applique + prévient les autres pages/onglets ouverts.
export function saveTextPrefs(sizePx: number, family: string) {
  localStorage.setItem(SIZE_KEY, String(sizePx));
  localStorage.setItem(FAMILY_KEY, family);
  applyTextPrefs(sizePx, family);
  window.dispatchEvent(new Event(TEXT_PREF_EVENT));
}