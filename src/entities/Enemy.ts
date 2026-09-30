import Phaser from 'phaser';
import { dir8, SpriteView } from '../systems/assets';
import type { Balance, EnemyConfig } from '../types';

let nextId = 1;

// Обычный враг из пула (ТЗ, 6, 7).
export class Enemy {
  readonly id = nextId++;
  active = false;
  dying = false;
  x = 0;
  y = 0;
  hp = 0;
  maxHp = 0;
  speed = 0;
  damage = 0;
  style = 0;
  radius = 0;
  knockbackResist = 0;
  summoned = false;
  isBoss = false;
  flash = 0;
  lastKnockVolley = -1;
  private kbX = 0;
  private kbY = 0;
  private dieT = 0;
  readonly view: SpriteView;

  constructor(scene: Phaser.Scene, readonly typeId: string, readonly cfg: EnemyConfig) {
    this.view = new SpriteView(scene, -1000, -1000, `enemy_${typeId}`, {
      shape: 'rect', w: cfg.size, h: cfg.size, color: cfg.color,
    });
    this.view.setActive(false).setVisible(false);
  }

  spawn(b: Balance, x: number, y: number, n: number, summoned: boolean): void {
    const c = this.cfg;
    this.active = true;
    this.dying = false;
    this.x = x;
    this.y = y;
    this.maxHp = this.hp = c.hp * (1 + (n - 1) * b.scaling.hpPerStream);
    this.damage = c.damage * (1 + (n - 1) * b.scaling.damagePerStream);
    this.speed = c.speed;
    this.style = c.style;
    this.radius = c.size / 2;
    this.knockbackResist = c.knockbackResist;
    this.summoned = summoned;
    this.flash = 0;
    this.kbX = this.kbY = 0;
    this.lastKnockVolley = -1;
    this.view.resetAnim();
    this.view.clearTint();
    this.view.setActive(true).setVisible(true).setAlpha(1).setPosition(x, y);
  }

  knock(dx: number, dy: number, amount: number): void {
    const a = amount * (1 - this.knockbackResist);
    if (a <= 0) return;
    const len = Math.hypot(dx, dy) || 1;
    this.kbX += (dx / len) * a;
    this.kbY += (dy / len) * a;
  }

  hit(): void {
    this.flash = 0.08;
    this.view.setTintFill(0xffffff);
  }

  /** Движение к героине; вплотную — анимация атаки. */
  update(dt: number, px: number, py: number, pr: number, arenaW: number, arenaH: number): void {
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.view.clearTint();
    }
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const touching = d <= this.radius + pr;
    if (!touching) {
      this.x += (dx / d) * this.speed * dt;
      this.y += (dy / d) * this.speed * dt;
    }
    if (this.kbX !== 0 || this.kbY !== 0) {
      const k = Math.min(1, dt * 14);
      this.x += this.kbX * k;
      this.y += this.kbY * k;
      this.kbX *= 1 - k;
      this.kbY *= 1 - k;
      if (Math.abs(this.kbX) + Math.abs(this.kbY) < 0.5) this.kbX = this.kbY = 0;
    }
    this.x = Phaser.Math.Clamp(this.x, this.radius, arenaW - this.radius);
    this.y = Phaser.Math.Clamp(this.y, this.radius, arenaH - this.radius);
    this.view.playAnim(touching ? (dx >= 0 ? 'attack_right' : 'attack_left') : `move_${dir8(dx, dy)}`);
  }

  sync(): void {
    this.view.setPosition(this.x, this.y);
    this.view.setDepth(this.y);
  }

  die(): void {
    this.dying = true;
    this.dieT = 0.3;
    this.view.clearTint();
    this.view.playAnim('death');
  }

  /** Анимация смерти; возвращает true, когда объект можно вернуть в пул. */
  updateDying(dt: number): boolean {
    this.dieT -= dt;
    this.view.setAlpha(Math.max(0, this.dieT / 0.3));
    if (this.dieT <= 0) {
      this.release();
      return true;
    }
    return false;
  }

  release(): void {
    this.active = false;
    this.dying = false;
    this.view.setActive(false).setVisible(false);
  }
}
