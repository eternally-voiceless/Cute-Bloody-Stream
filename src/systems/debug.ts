import { HEROINE_IDS, type HeroineId } from '../types';

// Отладочный режим через параметры URL (ТЗ, раздел 15).
export interface DebugOptions {
  enabled: boolean;
  heroine: HeroineId | null;
  stream: number | null;
  god: boolean;
  coins: number | null;
  speed: number;          // ускорение боя для автотестов (1 = обычная скорость)
}

export function parseDebug(search: string): DebugOptions {
  const p = new URLSearchParams(search);
  const heroine = p.get('heroine');
  const stream = p.get('stream');
  const coins = p.get('coins');
  const toInt = (v: string | null) => {
    if (v === null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const streamN = toInt(stream);
  return {
    enabled: p.get('debug') === '1',
    heroine: heroine && (HEROINE_IDS as string[]).includes(heroine) ? (heroine as HeroineId) : null,
    stream: streamN !== null ? Math.min(20, Math.max(1, streamN)) : null,
    god: p.get('god') === '1',
    coins: toInt(coins),
    speed: Math.min(8, Math.max(1, toInt(p.get('speed')) ?? 1)),
  };
}
