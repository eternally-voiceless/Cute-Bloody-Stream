import Phaser from 'phaser';
import { FONT } from './widgets';

interface Num { t: Phaser.GameObjects.Text; life: number; vy: number }

// Всплывающие цифры урона из пула (жёлтые при крите).
export class DamageNumbers {
  private active: Num[] = [];
  private free: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene) {}

  show(x: number, y: number, value: number, crit: boolean): void {
    const t = this.free.pop() ?? this.scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    t.setText(String(Math.max(1, Math.round(value))));
    t.setColor(crit ? '#ffd23f' : '#ffffff');
    t.setFontSize(crit ? 30 : 22);
    t.setPosition(x + Phaser.Math.Between(-10, 10), y - 20).setAlpha(1).setVisible(true).setActive(true).setDepth(100000);
    this.active.push({ t, life: 0.6, vy: -70 });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const n = this.active[i];
      n.life -= dt;
      n.t.y += n.vy * dt;
      n.t.setAlpha(Math.min(1, n.life / 0.3));
      if (n.life <= 0) {
        n.t.setVisible(false).setActive(false);
        this.free.push(n.t);
        this.active.splice(i, 1);
      }
    }
  }
}
