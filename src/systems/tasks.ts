import type { Balance, HeroineId, TaskState, TaskType } from '../types';

// Донат-задания (ТЗ, раздел 9).

function thresholdOf(b: Balance, n: number): number {
  return b.style.threshold.base + (n - 1) * b.style.threshold.step;
}

export function expectedKills(b: Balance, n: number): number {
  const e = b.tasks.expectedStylePerKill;
  return thresholdOf(b, n) / (e.base + (n - 1) * e.step);
}

export function taskTarget(b: Balance, type: TaskType, n: number, critChance: number): number {
  const t = b.tasks;
  const E = expectedKills(b, n);
  switch (type) {
    case 'kills': return Math.max(1, Math.ceil(t.kills.share * E));
    case 'crits': return Math.max(1, Math.ceil(t.crits.share * E * critChance / 100));
    case 'longShots': return Math.max(1, Math.ceil(t.longShots.share * E));
    case 'closeKills': return Math.max(1, Math.ceil(t.closeKills.share * E));
    case 'combo': return Math.min(t.combo.base + (n - 1) * t.combo.step, t.combo.max);
    case 'noHit': return Math.min(t.noHit.base + (n - 1) * t.noHit.step, t.noHit.max);
  }
}

export function taskReward(b: Balance, n: number): number {
  return b.tasks.reward.base + (n - 1) * b.tasks.reward.step;
}

export function createTask(b: Balance, heroineId: HeroineId, n: number, critChance: number): TaskState {
  let pool = b.tasks.byHeroine[heroineId].slice();
  if (critChance < b.tasks.crits.minCritChance) pool = pool.filter((t) => t !== 'crits');
  if (pool.length === 0) pool = ['kills'];
  const type = pool[Math.floor(Math.random() * pool.length)];
  return {
    type,
    target: taskTarget(b, type, n, critChance),
    progress: 0,
    reward: taskReward(b, n),
    completed: false,
    rewardPaid: false,
  };
}

export function taskText(t: TaskState): string {
  switch (t.type) {
    case 'kills': return `Убей ${t.target} зомби`;
    case 'crits': return `Убей ${t.target} зомби критом`;
    case 'longShots': return `Убей ${t.target} зомби издалека`;
    case 'closeKills': return `Убей ${t.target} зомби вплотную`;
    case 'combo': return `Набери серию ${t.target}`;
    case 'noHit': return `Не получай урон ${t.target} секунд подряд`;
  }
}

export function taskProgressText(t: TaskState): string {
  const p = Math.min(t.target, Math.floor(t.progress));
  return `${taskText(t)}: ${p} / ${t.target}${t.completed ? ' ✓' : ''}`;
}

/** Русское склонение после числа: plural(1, 'монета', 'монеты', 'монет'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
