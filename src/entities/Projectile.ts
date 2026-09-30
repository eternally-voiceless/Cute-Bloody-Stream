import Phaser from 'phaser';

// Снаряд из пула (ТЗ, 6): летит на дальность, пробивает pierce дополнительных целей.
export class Projectile {
  active = false;
  x = 0;
  y = 0;
  px = 0;   // позиция в прошлом кадре — для проверки пересечения отрезком
  py = 0;
  dirX = 0;
  dirY = 0;
  speed = 0;
  travelled = 0;
  maxDist = 0;
  damage = 0;
  hitsLeft = 0;
  volley = 0;
  readonly hit = new Set<number>();

  constructor(readonly sprite: Phaser.GameObjects.Image) {
    sprite.setActive(false).setVisible(false);
  }

  fire(x: number, y: number, angle: number, speed: number, range: number, damage: number, pierce: number, volley: number): void {
    this.active = true;
    this.x = this.px = x;
    this.y = this.py = y;
    this.dirX = Math.cos(angle);
    this.dirY = Math.sin(angle);
    this.speed = speed;
    this.travelled = 0;
    this.maxDist = range;
    this.damage = damage;
    this.hitsLeft = 1 + pierce;
    this.volley = volley;
    this.hit.clear();
    this.sprite.setActive(true).setVisible(true).setPosition(x, y).setRotation(angle);
  }

  /** Сдвиг; возвращает false, если снаряд пролетел дальность. */
  step(dt: number): boolean {
    this.px = this.x;
    this.py = this.y;
    const d = Math.min(this.speed * dt, this.maxDist - this.travelled);
    this.x += this.dirX * d;
    this.y += this.dirY * d;
    this.travelled += d;
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setDepth(this.y + 1);
    return this.travelled < this.maxDist;
  }

  release(): void {
    this.active = false;
    this.sprite.setActive(false).setVisible(false);
  }
}

// Пересечение отрезка (ax,ay)-(bx,by) с кругом (cx,cy,r).
export function segmentHitsCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + dx * t - cx;
  const ey = ay + dy * t - cy;
  return ex * ex + ey * ey <= r * r;
}
