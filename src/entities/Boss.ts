import Phaser from 'phaser';
import { dir8, SpriteView } from '../systems/assets';
import type { Balance } from '../types';

type BossState = 'chase' | 'telegraph' | 'dash';

// Босс «Хейтер»: преследование, рывок с предупреждением, призыв шатунов (ТЗ, 7.2).
export class Boss {
  readonly id = -1;
  readonly isBoss = true;
  active = true;
  dying = false;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  radius: number;
  flash = 0;
  lastKnockVolley = -1;
  state: BossState = 'chase';
  dashDirX = 0;
  dashDirY = 0;
  private stateT = 0;
  private dashLeft = 0;
  private dashCd: number;
  private summonCd: number;
  private dieT = 0;
  readonly view: SpriteView;

  constructor(scene: Phaser.Scene, private b: Balance, x: number, y: number) {
    const c = b.boss;
    this.x = x;
    this.y = y;
    this.hp = this.maxHp = c.hp;
    this.damage = c.damage;
    this.radius = c.size / 2;
    this.dashCd = c.dash.cooldown;
    this.summonCd = c.summon.cooldown;
    this.view = new SpriteView(scene, x, y, 'boss_hater', { shape: 'rect', w: c.size, h: c.size, color: c.color });
  }

  knock(): void { /* босс не отталкивается */ }

  hit(): void {
    this.flash = 0.08;
    this.view.setTintFill(0xffffff);
  }

  /** Возвращает true, если пора призвать шатунов. */
  update(dt: number, px: number, py: number, pr: number): boolean {
    const c = this.b.boss;
    const a = this.b.world.arena;
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.view.clearTint();
    }
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const side = dx >= 0 ? 'right' : 'left';

    if (this.state === 'chase') {
      if (d > this.radius + pr) {
        this.x += (dx / d) * c.speed * dt;
        this.y += (dy / d) * c.speed * dt;
      }
      this.view.playAnim(`move_${dir8(dx, dy)}`);
      this.dashCd -= dt;
      if (this.dashCd <= 0) {
        this.state = 'telegraph';
        this.stateT = c.dash.telegraph;
        this.dashDirX = dx / d;
        this.dashDirY = dy / d;
      }
    } else if (this.state === 'telegraph') {
      this.view.playAnim(`telegraph_${side}`);
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.state = 'dash';
        this.dashLeft = c.dash.distance;
      }
    } else {
      this.view.playAnim(`dash_${this.dashDirX >= 0 ? 'right' : 'left'}`);
      const step = Math.min(this.dashLeft, c.dash.speed * dt);
      this.x += this.dashDirX * step;
      this.y += this.dashDirY * step;
      this.dashLeft -= step;
      const hitWall = this.x <= this.radius || this.y <= this.radius ||
        this.x >= a.width - this.radius || this.y >= a.height - this.radius;
      if (this.dashLeft <= 0 || hitWall) {
        this.state = 'chase';
        this.dashCd = c.dash.cooldown;
      }
    }
    this.x = Phaser.Math.Clamp(this.x, this.radius, a.width - this.radius);
    this.y = Phaser.Math.Clamp(this.y, this.radius, a.height - this.radius);

    this.summonCd -= dt;
    if (this.summonCd <= 0) {
      this.summonCd = c.summon.cooldown;
      if (this.state === 'chase') this.view.playAnim('summon');
      return true;
    }
    return false;
  }

  sync(dt: number): void {
    this.view.place(this.x, this.y, this.state !== 'telegraph', dt);
    this.view.setDepth(this.y);
  }

  die(): void {
    this.dying = true;
    this.dieT = 0.8;
    this.view.clearTint();
    this.view.playAnim('death');
  }

  updateDying(dt: number): boolean {
    this.dieT -= dt;
    this.view.setAlpha(Math.max(0, this.dieT / 0.8));
    if (this.dieT <= 0) {
      this.active = false;
      this.view.setVisible(false);
      return true;
    }
    return false;
  }
}
