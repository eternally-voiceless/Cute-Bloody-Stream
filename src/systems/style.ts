import type { Balance, HeroineId } from '../types';

// Очки стиля за убийство (ТЗ, раздел 8).
export interface KillInfo {
  enemyStyle: number;
  crit: boolean;
  dist: number;
  range: number;
  combo: number;   // серия до этого убийства
}

export interface KillFlags { crit: boolean; longShot: boolean; close: boolean }

export function killFlags(b: Balance, k: Pick<KillInfo, 'crit' | 'dist' | 'range'>): KillFlags {
  return {
    crit: k.crit,
    longShot: k.dist >= b.style.longShotRatio * k.range,
    close: k.dist <= b.style.closeDistance,
  };
}

export function killStyle(b: Balance, heroineId: HeroineId, k: KillInfo): number {
  const s = b.style;
  const hm = b.heroines[heroineId].styleMultipliers;
  const f = killFlags(b, k);
  const bonus =
    (f.crit ? s.critBonus * (hm.crit ?? 1) : 0) +
    (f.longShot ? s.longShotBonus * (hm.longShot ?? 1) : 0) +
    (f.close ? s.closeBonus * (hm.close ?? 1) : 0);
  const comboMult = 1 + Math.min(k.combo, s.comboCap) * s.comboStep * (hm.combo ?? 1);
  return Math.round((k.enemyStyle + bonus) * comboMult);
}
