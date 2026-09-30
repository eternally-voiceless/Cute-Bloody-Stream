import { STAT_IDS, type Balance, type HeroineId, type RunState, type StatId, type StreamState } from '../types';
import { deriveStats } from './stats';
import { createTask } from './tasks';

// Состояние забега и стрима (ТЗ, раздел 10).
export function createRun(b: Balance, heroineId: HeroineId, startStream = 1, startCoins = 0): RunState {
  const statPoints = {} as Record<StatId, number>;
  const purchases = {} as Record<StatId, number>;
  for (const s of STAT_IDS) {
    statPoints[s] = b.heroines[heroineId].stats[s] ?? 0;
    purchases[s] = 0;
  }
  return {
    heroineId,
    stream: startStream,
    coins: startCoins,
    statPoints,
    purchases,
    totalStyle: 0,
    totalKills: 0,
    current: null,
  };
}

export function threshold(b: Balance, n: number): number {
  return b.style.threshold.base + (n - 1) * b.style.threshold.step;
}

export function isBossStream(b: Balance, n: number): boolean {
  return b.boss.streams.includes(n);
}

export function createStream(b: Balance, run: RunState): StreamState {
  const stats = deriveStats(b, run.heroineId, run.statPoints);
  return {
    phase: 'intro',
    styleRaw: 0,
    kills: 0,
    combo: 0,
    coinsFromDrops: 0,
    task: createTask(b, run.heroineId, run.stream, stats.critChance),
    isBossStream: isBossStream(b, run.stream),
    bossDead: false,
    thresholdReached: false,
    elapsed: 0,
    settled: false,
  };
}

export function viewers(b: Balance, run: RunState): number {
  const style = run.totalStyle + (run.current?.styleRaw ?? 0);
  return b.viewers.base + Math.floor(style * b.viewers.perStyle);
}
