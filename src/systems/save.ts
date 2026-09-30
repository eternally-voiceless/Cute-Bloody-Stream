import { HEROINE_IDS, type HeroineId } from '../types';

// Между забегами сохраняются только отметки «Пройдено» (ТЗ, 10.4).
const KEY = 'cbs_progress';

interface Progress { completed: Record<HeroineId, boolean> }

function empty(): Progress {
  return { completed: { genki: false, kuudere: false, yandere: false } };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const p = empty();
    for (const id of HEROINE_IDS) p.completed[id] = !!parsed.completed?.[id];
    return p;
  } catch {
    return empty();
  }
}

export function markCompleted(id: HeroineId): void {
  const p = loadProgress();
  p.completed[id] = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    console.warn('[save] localStorage недоступен, отметка «Пройдено» не сохранена');
  }
}
