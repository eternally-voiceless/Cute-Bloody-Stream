import Phaser from 'phaser';
import type { Balance } from '../types';
import { imageKey } from './assets';

interface Pending { x: number; y: number; type: string; t: number; marker: Phaser.GameObjects.Image }
export interface SpawnOrder { x: number; y: number; type: string }

// Появление врагов группами с меткой-предупреждением (ТЗ, раздел 7).
export class SpawnSystem {
  private timer = 0;           // первая группа — сразу при старте боя
  private pending: Pending[] = [];
  private markers: Phaser.GameObjects.Image[] = [];
  stopped = false;

  constructor(private scene: Phaser.Scene, private b: Balance, private n: number) {}

  interval(): number {
    const s = this.b.spawn;
    return Math.max(s.minInterval, s.interval - (this.n - 1) * s.intervalStep);
  }

  groupSize(): number {
    const s = this.b.spawn;
    return s.group + Math.floor((this.n - 1) / s.groupEvery);
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  pickType(): string {
    const list = Object.entries(this.b.enemies).filter(([, e]) => e.fromStream <= this.n && e.weight > 0);
    const total = list.reduce((s, [, e]) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const [id, e] of list) {
      r -= e.weight;
      if (r <= 0) return id;
    }
    return list[0]?.[0] ?? 'walker';
  }

  private pickPoint(px: number, py: number, margin: number): { x: number; y: number } {
    const a = this.b.world.arena;
    const minD = this.b.spawn.minDistance;
    let best = { x: margin, y: margin };
    let bestD = -1;
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.FloatBetween(margin, a.width - margin);
      const y = Phaser.Math.FloatBetween(margin, a.height - margin);
      const d = Math.hypot(x - px, y - py);
      if (d >= minD) return { x, y };
      if (d > bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  }

  private marker(x: number, y: number): Phaser.GameObjects.Image {
    const m = this.markers.pop() ?? this.scene.add.image(0, 0, imageKey(this.scene, 'spawn_marker'));
    return m.setActive(true).setVisible(true).setPosition(x, y).setDepth(-500).setAlpha(1);
  }

  /** alive — число живых обычных врагов (без босса). Возвращает врагов, которых пора создать. */
  update(dt: number, alive: number, px: number, py: number): SpawnOrder[] {
    const out: SpawnOrder[] = [];
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      p.marker.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(p.t * 10)));
      if (p.t <= 0) {
        out.push({ x: p.x, y: p.y, type: p.type });
        this.freeMarker(p.marker);
        this.pending.splice(i, 1);
      }
    }
    if (this.stopped) return out;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer += this.interval();
      const free = this.b.spawn.maxAlive - alive - this.pending.length;
      const count = Math.min(this.groupSize(), free);
      for (let i = 0; i < count; i++) {
        const type = this.pickType();
        const size = this.b.enemies[type].size;
        const pt = this.pickPoint(px, py, size / 2);
        this.pending.push({ ...pt, type, t: this.b.spawn.telegraph, marker: this.marker(pt.x, pt.y) });
      }
    }
    return out;
  }

  private freeMarker(m: Phaser.GameObjects.Image): void {
    m.setActive(false).setVisible(false);
    this.markers.push(m);
  }

  /** После порога обычный спавн прекращается, ожидающие появления отменяются. */
  stop(): void {
    this.stopped = true;
    for (const p of this.pending) this.freeMarker(p.marker);
    this.pending = [];
  }
}
