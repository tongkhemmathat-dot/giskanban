// js/theme.js — dark/light mode toggle + persistence (backlog: dark mode).
// Same localStorage pattern as store.js's `jc_me` (readMe/setMe). The actual
// theme switch is a `dark` class on <html> (Tailwind's class-based dark mode,
// configured at runtime in index.html since there's no build step / config
// file for the Play CDN). index.html's own inline <head> script applies this
// class before first paint (avoiding a flash of the wrong theme); initTheme()
// below just re-derives the same choice so this module and that script never
// disagree, and is what boots the `themechange` event chain everything else
// listens on.
const STORAGE_KEY = 'jc_theme';

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore (private browsing / storage disabled)
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  const stored = readStoredTheme();
  applyTheme(stored || (prefersDark() ? 'dark' : 'light'));
}
