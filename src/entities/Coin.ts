import Phaser from 'phaser';

// Монета: притягивается в радиусе магнита, подбирается касанием (ТЗ, 6).
export class Coin {
  active = false;
  x = 0;
  y = 0;
  private t = 0;

  constructor(readonly sprite: Phaser.GameObjects.Image) {
    sprite.setActive(false).setVisible(false);
  }

  drop(x: number, y: number): void {
    this.active = true;
    this.x = x;
    this.y = y;
    this.t = Math.random() * Math.PI * 2;
    this.sprite.setActive(true).setVisible(true).setPosition(x, y).setDepth(y - 1000);
  }

  /** Возвращает true, если монета подобрана. */
  update(dt: number, px: number, py: number, pickR: number, magnetR: number, magnetSpeed: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= pickR) return true;
    if (d <= magnetR) {
      const s = Math.min(d, magnetSpeed * dt);
      this.x += (dx / d) * s;
      this.y += (dy / d) * s;
    }
    this.t += dt * 4;
    this.sprite.setPosition(this.x, this.y + Math.sin(this.t) * 3);
    return false;
  }

  release(): void {
    this.active = false;
    this.sprite.setActive(false).setVisible(false);
  }
}
