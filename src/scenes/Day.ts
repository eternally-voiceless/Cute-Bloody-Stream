import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { imageKey } from '../systems/assets';
import { isBossStream } from '../systems/run';
import { canBuy, buy, price } from '../systems/shop';
import { deriveStats, statRows } from '../systems/stats';
import { STAT_IDS, type StatId } from '../types';
import { button, panel, text, type Button } from '../ui/widgets';

// «День» между стримами: магазин улучшений (ТЗ, 4.3, 5.3).
export class DayScene extends Phaser.Scene {
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private menu: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('Day'); }

  create(): void {
    if (!ctx.run) { this.scene.start('Select'); return; }
    this.dynamic = [];
    this.menu = [];
    this.input.keyboard!.on('keydown-ESC', () => this.toggleMenu());
    const g = this.add.graphics();
    g.fillGradientStyle(0x2a1a2e, 0x2a1a2e, 0x0b0b10, 0x0b0b10, 1).fillRect(0, 0, 1920, 1080);
    this.cameras.main.fadeIn(250);
    this.render();
  }

  private render(): void {
    for (const o of this.dynamic) o.destroy();
    this.dynamic = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.dynamic.push(o); return o; };
    const b = ctx.balance;
    const run = ctx.run!;
    const h = b.heroines[run.heroineId];
    const stats = deriveStats(b, run.heroineId, run.statPoints);

    // Сверху: номер следующего стрима и монеты.
    add(text(this, 960, 60, `День · следующий стрим ${run.stream} / 20${isBossStream(b, run.stream) ? ' · БОСС' : ''}`, 48, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    add(this.add.image(890, 135, imageKey(this, 'coin')).setDisplaySize(36, 36));
    add(text(this, 918, 135, `${run.coins}`, 40, '#ffd23f', { fontStyle: 'bold' }).setOrigin(0, 0.5));

    // Слева: текущие статы.
    add(panel(this, 80, 200, 640, 700));
    add(text(this, 120, 230, `${h.name} · @${h.nick}`, 36, '#ffffff', { fontStyle: 'bold' }));
    add(text(this, 120, 282, `Стиль за забег: ${run.totalStyle} · убийств: ${run.totalKills}`, 22, '#b9b5c9'));
    let y = 340;
    for (const row of statRows(stats)) {
      add(text(this, 120, y, row.label, 26, '#b9b5c9'));
      add(text(this, 680, y, row.value, 26, '#ffffff', { fontStyle: 'bold' }).setOrigin(1, 0));
      y += 58;
    }

    // Справа: 9 кнопок улучшений.
    add(panel(this, 780, 200, 1060, 700));
    add(text(this, 820, 230, 'Улучшения', 36, '#ffffff', { fontStyle: 'bold' }));
    STAT_IDS.forEach((stat, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 820 + col * 340 + 160;
      const yy = 360 + row * 180;
      add(this.shopButton(stat, x, yy));
    });

    add(button(this, 960, 980, 480, 84, `Начать стрим ${run.stream}`, () => this.startStream(), { size: 34 }));
  }

  private shopButton(stat: StatId, x: number, y: number): Button {
    const b = ctx.balance;
    const run = ctx.run!;
    const s = b.shop[stat];
    const p = price(b, run, stat);
    const label = `${s.name}\n+${s.increment} · ${p} мон.`;
    const btn = button(this, x, y, 320, 150, label, () => {
      if (buy(b, run, stat)) this.render();
    }, { color: 0x6a3d9a, size: 24 });
    btn.setEnabled(canBuy(b, run, stat));
    return btn;
  }

  // Esc: выход в главное меню с подтверждением, забег теряется.
  private toggleMenu(): void {
    if (this.menu.length > 0) {
      for (const o of this.menu) o.destroy();
      this.menu = [];
      return;
    }
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.menu.push(o); return o; };
    add(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.65).setInteractive());
    add(panel(this, 610, 330, 700, 420, 0.95));
    add(text(this, 960, 400, 'Выйти в меню?', 48, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    add(text(this, 960, 465, 'Забег будет потерян', 26, '#b9b5c9').setOrigin(0.5));
    add(button(this, 960, 560, 380, 76, 'Продолжить', () => this.toggleMenu()));
    add(button(this, 960, 660, 380, 64, 'В меню', () => {
      ctx.run = null;
      this.scene.start('Select');
    }, { color: 0x4a4560, size: 26 }));
  }

  private startStream(): void {
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Night'));
  }
}
