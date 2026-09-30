import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { colorNum, hasImage, imageKey, portraitKey } from '../systems/assets';
import { loadProgress } from '../systems/save';
import { createRun } from '../systems/run';
import { deriveStats, statRows } from '../systems/stats';
import { ChatSystem } from '../systems/chat';
import { ChatPanel } from '../ui/chatPanel';
import { button, panel, text } from '../ui/widgets';
import { HEROINE_IDS, type HeroineId } from '../types';

const CARD_W = 420;
const CARD_H = 630;
const CARD_GAP = 50;
const CARD_Y = 590;
const TRANSITION = 400;

interface Card { id: HeroineId; container: Phaser.GameObjects.Container; homeX: number }

// Экран выбора героини и selected_mode (ТЗ, 4.1).
export class SelectScene extends Phaser.Scene {
  private cards: Card[] = [];
  private header: Phaser.GameObjects.GameObject[] = [];
  private selected: Phaser.GameObjects.GameObject[] = [];
  private chatPanel: ChatPanel | null = null;
  private chat: ChatSystem | null = null;
  private busy = false;

  constructor() { super('Select'); }

  create(): void {
    this.cards = [];
    this.header = [];
    this.selected = [];
    this.chatPanel = null;
    this.chat = null;
    this.busy = false;

    this.drawBackground();
    const progress = loadProgress();
    this.header.push(
      text(this, 960, 90, 'Cute Bloody Stream', 72, '#ff4f8b', { fontStyle: 'bold', stroke: '#2a0612', strokeThickness: 8 }).setOrigin(0.5),
      text(this, 960, 170, 'Выбери стримершу', 32, '#e8e6f0').setOrigin(0.5),
      text(this, 960, 1040, 'WASD / стрелки — движение · стрельба автоматическая · Esc — пауза', 22, '#9a96aa').setOrigin(0.5),
    );

    const total = HEROINE_IDS.length * CARD_W + (HEROINE_IDS.length - 1) * CARD_GAP;
    HEROINE_IDS.forEach((id, i) => {
      const x = 960 - total / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      this.cards.push({ id, container: this.makeCard(id, x, progress.completed[id]), homeX: x });
    });
    this.cameras.main.fadeIn(250);
  }

  update(_t: number, dtMs: number): void {
    this.chat?.update(dtMs / 1000);
  }

  private drawBackground(): void {
    if (hasImage(this, 'select_bg')) {
      const img = this.add.image(960, 540, imageKey(this, 'select_bg'));
      img.setScale(Math.max(1920 / img.width, 1080 / img.height));
      return;
    }
    const g = this.add.graphics();
    g.fillGradientStyle(0x1b1026, 0x1b1026, 0x07070b, 0x07070b, 1).fillRect(0, 0, 1920, 1080);
  }

  private makeCard(id: HeroineId, x: number, completed: boolean): Phaser.GameObjects.Container {
    const h = ctx.balance.heroines[id];
    const col = Phaser.Display.Color.IntegerToColor(colorNum(h.color));
    const top = col.clone().lighten(10).color;
    const bottom = col.clone().darken(30).color;
    const c = this.add.container(x, CARD_Y);

    const bg = this.add.graphics();
    bg.fillGradientStyle(top, top, bottom, bottom, 1).fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
    c.add(bg);

    const key = portraitKey(id, 'base');
    if (this.textures.exists(key)) {
      const img = this.add.image(0, CARD_H / 2, key).setOrigin(0.5, 1);
      img.setScale(Math.min(CARD_W / img.width, CARD_H / img.height));
      c.add(img);
    } else {
      c.add(this.add.rectangle(0, 20, 180, 440, 0x000000, 0.35));
    }

    const strip = this.add.graphics();
    strip.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.85, 0.85)
      .fillRect(-CARD_W / 2, CARD_H / 2 - 140, CARD_W, 140);
    c.add(strip);
    c.add(text(this, 0, CARD_H / 2 - 78, h.name, 44, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    c.add(text(this, 0, CARD_H / 2 - 34, h.archetype, 24, '#e0dcef').setOrigin(0.5));

    if (completed) {
      const badge = this.add.graphics();
      badge.fillStyle(0x2ecc71, 0.95).fillRoundedRect(CARD_W / 2 - 176, -CARD_H / 2 + 16, 160, 44, 12);
      c.add(badge);
      c.add(text(this, CARD_W / 2 - 96, -CARD_H / 2 + 38, '✓ Пройдено', 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    }

    const frame = this.add.graphics();
    const drawFrame = (hover: boolean) => {
      frame.clear();
      frame.lineStyle(hover ? 6 : 3, hover ? 0xffffff : 0xffffff, hover ? 0.95 : 0.25)
        .strokeRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
    };
    drawFrame(false);
    c.add(frame);

    c.setSize(CARD_W, CARD_H);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerover', () => {
      if (this.busy) return;
      drawFrame(true);
      this.tweens.add({ targets: c, scale: 1.04, duration: 120 });
    });
    c.on('pointerout', () => {
      drawFrame(false);
      this.tweens.add({ targets: c, scale: 1, duration: 120 });
    });
    c.on('pointerup', () => { if (!this.busy) this.enterSelected(id); });
    return c;
  }

  private enterSelected(id: HeroineId): void {
    this.busy = true;
    const b = ctx.balance;
    const h = b.heroines[id];

    for (const card of this.cards) {
      card.container.disableInteractive();
      if (card.id === id) {
        this.tweens.add({ targets: card.container, alpha: 0, scale: 1.08, duration: TRANSITION });
      } else {
        const dir = card.homeX < 960 ? -1 : 1;
        this.tweens.add({ targets: card.container, x: card.homeX + dir * 1500, duration: TRANSITION, ease: 'Cubic.easeIn' });
      }
    }
    this.tweens.add({ targets: this.header, alpha: 0, duration: TRANSITION });

    // Фон-бункер на весь экран, масштаб «cover».
    const bgKey = portraitKey(id, 'background');
    let bg: Phaser.GameObjects.GameObject;
    if (this.textures.exists(bgKey)) {
      const img = this.add.image(960, 540, bgKey);
      img.setScale(Math.max(1920 / img.width, 1080 / img.height));
      bg = img;
    } else {
      const col = colorNum(h.color);
      const g = this.add.graphics();
      g.fillGradientStyle(col, col, 0x07070b, 0x07070b, 1).fillRect(0, 0, 1920, 1080);
      bg = g;
    }
    this.selected.push(bg);

    // Героиня по центру: высота 1000 px, низ по нижнему краю.
    const selKey = portraitKey(id, 'selected');
    if (this.textures.exists(selKey)) {
      const img = this.add.image(960, 1080, selKey).setOrigin(0.5, 1);
      img.setScale(1000 / img.height);
      this.selected.push(img);
    } else {
      this.selected.push(this.add.rectangle(960, 1080, 360, 1000, colorNum(h.color), 0.6).setOrigin(0.5, 1));
    }

    // Слева: панель статов и кнопки.
    const stats = deriveStats(b, id, b.heroines[id].stats);
    const w = b.weapons[h.weapon];
    this.selected.push(panel(this, 40, 60, 480, 960));
    this.selected.push(text(this, 80, 90, h.name, 56, '#ffffff', { fontStyle: 'bold' }));
    this.selected.push(text(this, 80, 160, h.archetype, 28, '#ffb3cf'));
    this.selected.push(text(this, 80, 205, `Оружие: ${w.name}`, 22, '#d6d3e3', { wordWrap: { width: 410 } }));
    let y = 280;
    for (const row of statRows(stats)) {
      this.selected.push(text(this, 80, y, row.label, 22, '#b9b5c9'));
      this.selected.push(text(this, 480, y, row.value, 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(1, 0));
      y += 44;
    }
    this.selected.push(button(this, 280, 850, 400, 76, 'Начать забег', () => this.startRun(id), { size: 32 }));
    this.selected.push(button(this, 280, 945, 400, 64, 'Назад', () => this.exitSelected(), { color: 0x4a4560, size: 26 }));

    // Справа: чат под эту героиню.
    this.chatPanel = new ChatPanel(this, 1400, 40, 480, 1000, b.chat.maxMessages);
    this.chat = new ChatSystem(this.chatPanel, ctx.chat, b, id);
    this.chat.idleCategory = `select_${id}`;
    this.chat.event(`select_${id}`);
    this.chatPanel.setAlpha(0);

    for (const o of this.selected) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
    const chatDom = this.chatPanel.dom;
    this.tweens.add({
      targets: [...this.selected, chatDom], alpha: 1, duration: TRANSITION,
      onComplete: () => { this.busy = false; },
    });
  }

  private exitSelected(): void {
    if (this.busy) return;
    this.busy = true;
    const chatDom = this.chatPanel?.dom;
    const fading = [...this.selected, ...(chatDom ? [chatDom] : [])];
    this.tweens.add({
      targets: fading, alpha: 0, duration: TRANSITION,
      onComplete: () => {
        for (const o of this.selected) o.destroy();
        this.selected = [];
        this.chatPanel?.destroy();
        this.chatPanel = null;
        this.chat = null;
      },
    });
    this.tweens.add({ targets: this.header, alpha: 1, duration: TRANSITION });
    for (const card of this.cards) {
      this.tweens.add({
        targets: card.container, x: card.homeX, alpha: 1, scale: 1, duration: TRANSITION, ease: 'Cubic.easeOut',
        onComplete: () => {
          card.container.setInteractive({ useHandCursor: true });
          this.busy = false;
        },
      });
    }
  }

  private startRun(id: HeroineId): void {
    if (this.busy) return;
    this.busy = true;
    const d = ctx.debug;
    ctx.run = createRun(ctx.balance, id, d.stream ?? 1, d.coins ?? 0);
    this.cameras.main.fadeOut(300);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Night'));
  }
}
