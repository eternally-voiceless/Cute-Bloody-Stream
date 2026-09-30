// Настройки игрока (громкость). Хранятся в localStorage между запусками; без него — значения по умолчанию.
const KEY = 'cbs_settings';

export interface Settings {
  sfx: number;    // 0…1, громкость выстрелов и эффектов
  music: number;  // 0…1, громкость музыки
}

const DEFAULTS: Settings = { sfx: 0.03, music: 0.05 };

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

function load(): Settings {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { sfx: clamp01(p.sfx, DEFAULTS.sfx), music: clamp01(p.music, DEFAULTS.music) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings = load();

const changeListeners = new Set<() => void>();
const openListeners = new Set<() => void>();

export function setSetting(key: keyof Settings, value: number, save = true): void {
  settings[key] = clamp01(value, settings[key]);
  for (const fn of changeListeners) fn();
  if (!save) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    console.warn('[settings] localStorage недоступен, настройки не сохранены');
  }
}

/** Подписка на изменение настроек; возвращает отписку. */
export function onSettingsChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Подписка на открытие окна настроек (стрим ставит себя на паузу); возвращает отписку. */
export function onSettingsOpen(fn: () => void): () => void {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
}

export function emitSettingsOpen(): void {
  for (const fn of openListeners) fn();
}

// Режим стрельбы (Q): автоприцел или ручной по мыши. Запоминается между забегами.
const AIM_KEY = 'cbs_aim';

export function loadManualAim(): boolean {
  try {
    return localStorage.getItem(AIM_KEY) === 'manual';
  } catch {
    return false;
  }
}

export function saveManualAim(manual: boolean): void {
  try {
    localStorage.setItem(AIM_KEY, manual ? 'manual' : 'auto');
  } catch {
    // без localStorage режим живёт до перезагрузки
  }
}
