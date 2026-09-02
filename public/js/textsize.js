// js/textsize.js — "ตัวอักษรใหญ่" (large text) toggle for older users
// (backlog request). Same shape/localStorage pattern as theme.js — a class
// on <html> ('large-text'), toggled + persisted, applied via index.html's
// inline <head> script before first paint to avoid a flash of normal-sized
// text. The actual scaling happens entirely in public/css/app.css (root
// font-size bump, which cascades through every rem-based Tailwind text/
// spacing utility for free) — this module only owns the on/off state.
const STORAGE_KEY = 'jc_textsize';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getTextSize() {
  return document.documentElement.classList.contains('large-text') ? 'large' : 'normal';
}

export function applyTextSize(size) {
  document.documentElement.classList.toggle('large-text', size === 'large');
}

export function setTextSize(size) {
  applyTextSize(size);
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // ignore (private browsing / storage disabled)
  }
  // dashboard.view.js's Chart.js canvases draw their own tick/legend text
  // and don't inherit CSS font-size, so they need to know this changed and
  // redraw — same reasoning/mechanism as theme.js's 'themechange' event.
  window.dispatchEvent(new CustomEvent('textsizechange', { detail: { size } }));
}

export function toggleTextSize() {
  setTextSize(getTextSize() === 'large' ? 'normal' : 'large');
}

export function initTextSize() {
  applyTextSize(readStored() === 'large' ? 'large' : 'normal');
}
