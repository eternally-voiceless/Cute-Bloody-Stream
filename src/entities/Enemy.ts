import Phaser from 'phaser';
import { dir8, envKey, SpriteView } from '../systems/assets';
import { ctx } from '../systems/context';
import type { Balance, EnemyConfig } from '../types';

let nextId = 1;

/** Что враг знает о героине на этом шаге. */
export interface ChaseInfo {
  x: number;
  y: number;
  r: number;
  vx: number;        // скорость героини, px/с
  vy: number;
  speed: number;     // её скорость передвижения из характеристик
  caneFree: boolean; // ни один сталкер сейчас не бросает и не держит трость
}

// chase — идёт к героине; freeze/leap — охотник; cast/throw/hold/retract — сталкер.
type Mode = 'chase' | 'freeze' | 'leap' | 'cast' | 'throw' | 'hold' | 'retract';

// Обычный враг из пула (ТЗ, 6, 7). Охотник и сталкер — тот же класс с дополнительным поведением из конфига.
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
  moving = false;
  mode: Mode = 'chase';
  /** Направление прыжка охотника или броска трости. */
  dirX = 0;
  dirY = 0;
  private kbX = 0;
  private kbY = 0;
  private dieT = 0;
  private t = 0;      // таймер текущего режима
  private cd = 0;     // перезарядка прыжка или броска
  private face = 1;   // 1 — смотрит вправо, -1 — влево
  // Прыжок: квадратичная кривая Безье p0 → c → p1.
  private leapT = 0;
  private leapDur = 0;
  private p0 = { x: 0, y: 0 };
  private c = { x: 0, y: 0 };
  private p1 = { x: 0, y: 0 };
  // Трость: длина от руки до конца.
  private caneLen = 0;
  readonly view: SpriteView;
  private caneShaft: Phaser.GameObjects.TileSprite | null = null;
  private caneTip: Phaser.GameObjects.Image | null = null;
  private caneTipClosed = '';

  constructor(scene: Phaser.Scene, readonly typeId: string, readonly cfg: EnemyConfig) {
    this.view = new SpriteView(scene, -1000, -1000, `enemy_${typeId}`, {
      shape: 'rect', w: cfg.size, h: cfg.size, color: cfg.color,
    });
    this.view.setActive(false).setVisible(false);
    const cane = ctx.assets.cane;
    if (cfg.cane && cane && scene.textures.exists(envKey(cane.shaft))) {
      this.caneShaft = scene.add.tileSprite(0, 0, 10, scene.textures.get(envKey(cane.shaft)).get().height, envKey(cane.shaft))
        .setOrigin(0, 0.5).setVisible(false);
      this.caneTip = scene.add.image(0, 0, envKey(cane.open)).setVisible(false);
      this.caneTipClosed = envKey(cane.closed);
    }
  }

  get isLeaping(): boolean { return this.mode === 'leap'; }
  get grabbing(): boolean { return this.mode === 'hold'; }
  /** Трость в деле: бросок, хват или возврат. Второй сталкер в это время не бросает. */
  get caneBusy(): boolean { return this.mode === 'throw' || this.mode === 'hold' || this.mode === 'cast'; }
  /** Длина прыжка охотника, px. */
  get leapLength(): number { return this.cfg.leap ? this.cfg.leap.distance * this.cfg.leap.radius : 0; }

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
    this.mode = 'chase';
    this.cd = 0.5;   // сразу после появления не прыгает и не бросает
    this.view.resetAnim();
    this.view.clearTint();
    this.view.setActive(true).setVisible(true).setAlpha(1).setPosition(x, y);
  }

  /** resistScale < 1 — толчок частично пробивает сопротивление (громилу толкает и способность героини). */
  knock(dx: number, dy: number, amount: number, resistScale = 1): void {
    const a = amount * (1 - this.knockbackResist * resistScale);
    if (a <= 0) return;
    const len = Math.hypot(dx, dy) || 1;
    this.kbX += (dx / len) * a;
    this.kbY += (dy / len) * a;
  }

  hit(): void {
    this.flash = 0.08;
    this.view.setTintFill(0xffffff);
  }

  /** Сталкер отпускает героиню: F, рывок, конец времени хвата или смерть. */
  releaseGrab(): void {
    if (this.mode !== 'hold' && this.mode !== 'throw' && this.mode !== 'cast') return;
    this.mode = this.mode === 'cast' ? 'chase' : 'retract';
    this.cd = this.cfg.cane?.cooldown ?? 0;
  }

  update(dt: number, p: ChaseInfo, arenaW: number, arenaH: number): void {
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) this.view.clearTint();
    }
    const c = this.cfg;
    this.speed = c.speedOfPlayer ? p.speed * c.speedOfPlayer : c.matchPlayerSpeed ? Math.max(c.speed, p.speed) : c.speed;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const touching = d <= this.radius + p.r;
    if (Math.abs(dx) > 4) this.face = dx > 0 ? 1 : -1;
    this.cd -= dt;
    this.moving = false;
    let anim = touching ? (dx >= 0 ? 'attack_right' : 'attack_left') : `move_${dir8(dx, dy)}`;
    const side = this.face > 0 ? 'right' : 'left';

    switch (this.mode) {
      case 'chase': {
        if (!touching) this.step(dx, dy, d, dt);
        const leap = c.leap;
        if (leap && this.cd <= 0 && d <= leap.radius) {
          this.mode = 'freeze';
          this.t = leap.freeze;
          this.dirX = dx / d;
          this.dirY = dy / d;
        }
        const cane = c.cane;
        if (cane && this.cd <= 0 && p.caneFree && d <= cane.range && d >= cane.minRange) {
          this.mode = 'cast';
          this.t = cane.telegraph;
        }
        break;
      }
      case 'freeze': {
        // Замер и красная линия; затем прыжок по дуге к тому месту, где героиня будет в конце прыжка.
        anim = `attack_${this.dirX >= 0 ? 'right' : 'left'}`;
        this.t -= dt;
        if (this.t <= 0) this.startLeap(p);
        break;
      }
      case 'leap': {
        anim = `attack_${this.dirX >= 0 ? 'right' : 'left'}`;
        this.moving = true;
        this.leapT += dt;
        const u = Math.min(1, this.leapT / this.leapDur);
        const a = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, cc = u * u;
        this.x = a * this.p0.x + b2 * this.c.x + cc * this.p1.x;
        this.y = a * this.p0.y + b2 * this.c.y + cc * this.p1.y;
        if (u >= 1) {
          this.mode = 'chase';
          this.cd = c.leap!.cooldown;
        }
        break;
      }
      case 'cast': {
        // Замах: стоит в позе броска, направление фиксируется в конце замаха.
        anim = `cast_${side}`;
        this.t -= dt;
        if (this.t <= 0) {
          this.mode = 'throw';
          const h = this.hand();
          const hx = p.x - h.x, hy = p.y - h.y;
          const hd = Math.hypot(hx, hy) || 1;
          this.dirX = hx / hd;
          this.dirY = hy / hd;
          this.caneLen = 0;
        }
        break;
      }
      case 'throw': {
        anim = `cast_${side}`;
        const cane = c.cane!;
        this.caneLen += cane.speed * dt;
        const h = this.hand();
        const tx = h.x + this.dirX * this.caneLen, ty = h.y + this.dirY * this.caneLen;
        if (Math.hypot(tx - p.x, ty - p.y) <= p.r + 14) {
          this.mode = 'hold';
          this.t = cane.hold;
        } else if (this.caneLen >= cane.range * 1.1) {
          this.mode = 'retract';
          this.cd = cane.cooldown;
        }
        break;
      }
      case 'hold': {
        // Героиня стоит, сталкер идёт к ней, трость натянута до героини.
        anim = touching ? `attack_${side}` : `cast_${side}`;
        if (!touching) this.step(dx, dy, d, dt);
        this.t -= dt;
        if (this.t <= 0) this.releaseGrab();
        break;
      }
      case 'retract': {
        anim = `cast_${side}`;
        this.caneLen -= (c.cane?.speed ?? 1000) * 1.6 * dt;
        if (this.caneLen <= 0) this.mode = 'chase';
        break;
      }
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
    if (this.mode === 'hold') {
      // Трость держит героиню: конец трости у неё.
      const h = this.hand();
      this.caneLen = Math.hypot(p.x - h.x, p.y - h.y);
      this.dirX = (p.x - h.x) / (this.caneLen || 1);
      this.dirY = (p.y - h.y) / (this.caneLen || 1);
    }
    this.view.playAnim(anim);
  }

  private step(dx: number, dy: number, d: number, dt: number): void {
    this.moving = true;
    this.x += (dx / d) * this.speed * dt;
    this.y += (dy / d) * this.speed * dt;
  }

  private startLeap(p: ChaseInfo): void {
    const leap = this.cfg.leap!;
    const L = leap.distance * leap.radius;
    const T = L / leap.speed;
    // Конец прямой линии, сдвинутый туда, куда героиня успеет уйти за время прыжка.
    let sx = p.vx * T * leap.lead, sy = p.vy * T * leap.lead;
    const s = Math.hypot(sx, sy);
    if (s > L * 0.8) { sx *= (L * 0.8) / s; sy *= (L * 0.8) / s; }
    this.p0 = { x: this.x, y: this.y };
    this.c = { x: this.x + this.dirX * L * 0.5, y: this.y + this.dirY * L * 0.5 };
    this.p1 = { x: this.x + this.dirX * L + sx, y: this.y + this.dirY * L + sy };
    this.leapT = 0;
    this.leapDur = T;
    this.mode = 'leap';
  }

  /** Точка, откуда вылетает трость (у рук сталкера). */
  private hand(): { x: number; y: number } {
    const h = this.cfg.cane?.hand ?? [0, 0];
    return { x: this.x + h[0] * this.face, y: this.y + h[1] };
  }

  sync(dt: number): void {
    this.view.place(this.x, this.y, this.moving, dt);
    this.view.setDepth(this.y);
    this.syncCane();
  }

  private syncCane(): void {
    const shaft = this.caneShaft, tip = this.caneTip;
    if (!shaft || !tip) return;
    const show = this.active && !this.dying && (this.mode === 'throw' || this.mode === 'hold' || this.mode === 'retract') && this.caneLen > 0;
    shaft.setVisible(show);
    tip.setVisible(show);
    if (!show) return;
    const h = this.hand();
    const ang = Math.atan2(this.dirY, this.dirX);
    const ex = h.x + this.dirX * this.caneLen, ey = h.y + this.dirY * this.caneLen;
    const closed = this.mode === 'hold';
    tip.setTexture(closed ? this.caneTipClosed : envKey(ctx.assets.cane!.open));
    // Крюк — правая часть картинки: её центр ставим в конец трости, стержень тянется до начала картинки.
    tip.setOrigin(0.72, 0.5).setPosition(ex, ey).setRotation(ang).setFlipY(this.dirX < 0);
    const shaftLen = Math.max(0, this.caneLen - tip.width * 0.6);
    shaft.setPosition(h.x, h.y).setRotation(ang).setSize(shaftLen, shaft.height);
    const depth = Math.max(this.y, ey) + 1;
    shaft.setDepth(depth);
    tip.setDepth(depth + 0.1);
  }

  die(): void {
    this.dying = true;
    this.dieT = 0.3;
    if (this.mode !== 'chase') this.mode = 'chase';
    this.caneShaft?.setVisible(false);
    this.caneTip?.setVisible(false);
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
    this.mode = 'chase';
    this.caneShaft?.setVisible(false);
    this.caneTip?.setVisible(false);
    this.view.setActive(false).setVisible(false);
  }
}
