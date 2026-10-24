// Mode d'apparence global : clair, sombre ou « système ».
// Stocké en localStorage, appliqué sur <html> (classe `dark` + color-scheme) et synchronisé
// entre les pages/onglets via un événement, comme les préférences de texte (textPrefs.ts).

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODE_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Clair' },
  { id: 'dark', label: 'Sombre' },
  { id: 'system', label: 'Système' },
];

const KEY = 'cbfsoko-theme-mode';
export const THEME_MODE_EVENT = 'storage-theme-mode';

export function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light';
  } catch {
    return 'light';
  }
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Applique le mode sur le document (sans sauvegarder). */
export function applyThemeMode(mode: ThemeMode) {
  const dark = resolveDark(mode);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0b0c' : '#ffffff');
}

/** Sauvegarde + applique + prévient les autres composants ouverts. */
export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* stockage indisponible : le mode s'applique pour cette session seulement */
  }
  applyThemeMode(mode);
  window.dispatchEvent(new Event(THEME_MODE_EVENT));
}
