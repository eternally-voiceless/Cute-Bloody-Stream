import Phaser from 'phaser';
import { dir4, makeSpriteImage, SpriteView, type Dir4 } from '../systems/assets';
import type { DerivedStats } from '../systems/stats';
import type { Balance, HeroineId } from '../types';

// Героиня на арене: движение, оружие, неуязвимость (ТЗ, 6).
export class Player {
  x: number;
  y: number;
  hp: number;
  invul = 0;
  facing: Dir4 = 'down';
  moving = false;
  fireTimer = 0;
  readonly radius: number;
  readonly view: SpriteView;
  readonly weapon: Phaser.GameObjects.Image;
  private arrow: Phaser.GameObjects.Triangle | null = null;
  private aim = 0;

  constructor(
    scene: Phaser.Scene,
    private b: Balance,
    readonly heroineId: HeroineId,
    public stats: DerivedStats,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    this.hp = stats.maxHp;
    this.radius = b.player.size / 2;
    const h = b.heroines[heroineId];
    this.view = new SpriteView(scene, x, y, `hero_${heroineId}`, {
      shape: 'rect', w: b.player.size, h: b.player.size, color: h.color,
    });
    if (this.view.isPlaceholder) {
      // Стрелка направления движения поверх квадрата-плейсхолдера.
      this.arrow = scene.add.triangle(x, y, 0, -9, 0, 9, 16, 0, 0xffffff).setOrigin(0, 0);
    }
    this.weapon = makeSpriteImage(scene, `weapon_${stats.weaponId}`, { shape: 'rect', w: 36, h: 8, color: '#ffffff' });
  }

  /** Точка крепления оружия (ось поворота). */
  get muzzle(): { x: number; y: number } {
    const [ax, ay] = this.view.weaponAnchor;
    return { x: this.x + ax, y: this.y + ay };
  }

  /** Конец ствола при текущем прицеливании — отсюда вылетают снаряды. */
  get barrelTip(): { x: number; y: number } {
    const m = this.muzzle;
    const len = this.weapon.displayWidth * (1 - this.weapon.originX);
    return { x: m.x + Math.cos(this.aim) * len, y: m.y + Math.sin(this.aim) * len };
  }

  move(dt: number, ix: number, iy: number): void {
    const len = Math.hypot(ix, iy);
    this.moving = len > 0;
    if (this.moving) {
      const s = this.stats.moveSpeed * dt / len;
      this.x += ix * s;
      this.y += iy * s;
      this.facing = dir4(ix, iy);
    }
    const a = this.b.world.arena;
    this.x = Phaser.Math.Clamp(this.x, this.radius, a.width - this.radius);
    this.y = Phaser.Math.Clamp(this.y, this.radius, a.height - this.radius);
  }

  aimAt(tx: number, ty: number): void {
    const m = this.muzzle;
    this.aim = Math.atan2(ty - m.y, tx - m.x);
  }

  tick(dt: number): void {
    if (this.invul > 0) this.invul = Math.max(0, this.invul - dt);
  }

  sync(dt: number): void {
    this.view.place(this.x, this.y, this.moving, dt);
    this.view.playAnim(`${this.moving ? 'move' : 'idle'}_${this.facing}`);
    this.view.setDepth(this.y);
    // Мигание при неуязвимости.
    const blink = this.invul > 0 && Math.floor(this.invul * 20) % 2 === 0;
    this.view.setAlpha(blink ? 0.35 : 1);
    if (this.arrow) {
      const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[this.facing];
      this.arrow.setPosition(this.x + Math.cos(ang) * 8, this.y + Math.sin(ang) * 8);
      this.arrow.setRotation(ang);
      this.arrow.setDepth(this.y + 0.1);
      this.arrow.setAlpha(this.view.alpha);
    }
    const m = this.muzzle;
    this.weapon.setPosition(m.x, m.y + this.view.bobOffset);
    this.weapon.setRotation(this.aim);
    this.weapon.setFlipY(Math.cos(this.aim) < 0);
    this.weapon.setDepth(this.y + 0.2);
  }

  setVisible(v: boolean): void {
    this.view.setVisible(v);
    this.weapon.setVisible(v);
    this.arrow?.setVisible(v);
  }
}
