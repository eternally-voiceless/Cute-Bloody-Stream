import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { button, text } from '../ui/widgets';

// Поражение: «Стрим прерван» (ТЗ, 4.4, 10.3).
export class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  create(): void {
    const run = ctx.run;
    const g = this.add.graphics();
    g.fillGradientStyle(0x3a0610, 0x3a0610, 0x07070b, 0x07070b, 1).fillRect(0, 0, 1920, 1080);
    this.cameras.main.fadeIn(300);
    text(this, 960, 330, 'Стрим прерван', 96, '#ff2a4a', { fontStyle: 'bold', stroke: '#000000', strokeThickness: 8 }).setOrigin(0.5);
    text(this, 960, 440, 'НЕТ СИГНАЛА', 36, '#9a96aa').setOrigin(0.5);
    if (run) {
      const style = run.totalStyle + (run.current?.styleRaw ?? 0);
      const heroine = ctx.balance.heroines[run.heroineId].name;
      text(this, 960, 540, `${heroine} · стрим ${run.stream} / 20`, 40, '#ffffff').setOrigin(0.5);
      text(this, 960, 600, `Итоговый стиль: ${style}`, 40, '#ffd23f', { fontStyle: 'bold' }).setOrigin(0.5);
    }
    button(this, 960, 760, 460, 80, 'К выбору героини', () => {
      ctx.run = null;
      this.scene.start('Select');
    });
  }
}
