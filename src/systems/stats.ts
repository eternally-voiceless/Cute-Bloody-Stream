import type { Balance, HeroineId, StatId, WeaponConfig } from '../types';

// Итоговые значения статов (ТЗ, 5.2).
export interface DerivedStats {
  maxHp: number;
  damage: number;
  fireRate: number;
  moveSpeed: number;
  range: number;
  armor: number;
  armorFactor: number;   // множитель получаемого урона
  regenPerSec: number;
  critChance: number;    // %
  dropChance: number;    // %
  weapon: WeaponConfig;
  weaponId: string;
}

export function factor(b: Balance, s: number): number {
  return Math.min(b.stats.maxFactor, Math.max(b.stats.minFactor, 1 + s / 100));
}

export function deriveStats(b: Balance, heroineId: HeroineId, points: Record<StatId, number>): DerivedStats {
  const h = b.heroines[heroineId];
  const w = b.weapons[h.weapon];
  const armor = Math.max(0, points.armor);
  return {
    maxHp: h.baseHp * factor(b, points.hp),
    damage: w.damage * factor(b, points.damage),
    fireRate: w.fireRate * factor(b, points.attackSpeed),
    moveSpeed: h.baseMoveSpeed * factor(b, points.moveSpeed),
    range: w.range * factor(b, points.range),
    armor,
    armorFactor: 1 - armor / (armor + b.stats.armorK),
    regenPerSec: Math.max(0, points.regen) / b.stats.regenAlpha,
    critChance: Math.min(100, Math.max(0, w.critChance + points.crit)),
    dropChance: Math.min(100, Math.max(0, points.resourceSearch)),
    weapon: w,
    weaponId: h.weapon,
  };
}

// Строки для панели статов (Select, Day).
export function statRows(s: DerivedStats): { label: string; value: string }[] {
  const fmt = (v: number, d = 0) => v.toFixed(d).replace('.', ',');
  return [
    { label: 'Здоровье', value: fmt(s.maxHp) },
    { label: 'Урон', value: fmt(s.damage, 1) + (s.weapon.pellets > 1 ? ` × ${s.weapon.pellets}` : '') },
    { label: 'Скорость атаки', value: `${fmt(s.fireRate, 2)} /с` },
    { label: 'Скорость передвижения', value: fmt(s.moveSpeed) },
    { label: 'Дальность атаки', value: fmt(s.range) },
    { label: 'Броня', value: `${fmt(s.armor)} (−${fmt((1 - s.armorFactor) * 100)}%)` },
    { label: 'Восстановление', value: `${fmt(s.regenPerSec, 1)} HP/с` },
    { label: 'Шанс крита', value: `${fmt(s.critChance)}%` },
    { label: 'Поиск ресурсов', value: `${fmt(s.dropChance)}%` },
  ];
}
