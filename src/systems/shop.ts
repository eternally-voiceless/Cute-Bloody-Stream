import type { Balance, RunState, StatId } from '../types';

// Магазин: цена k-й покупки стата = basePrice + k · priceStep (ТЗ, 5.3).
export function price(b: Balance, run: RunState, stat: StatId): number {
  const s = b.shop[stat];
  return s.basePrice + run.purchases[stat] * s.priceStep;
}

export function canBuy(b: Balance, run: RunState, stat: StatId): boolean {
  return run.coins >= price(b, run, stat);
}

export function buy(b: Balance, run: RunState, stat: StatId): boolean {
  const p = price(b, run, stat);
  if (run.coins < p) return false;
  run.coins -= p;
  run.statPoints[stat] += b.shop[stat].increment;
  run.purchases[stat] += 1;
  return true;
}
