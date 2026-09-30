import Phaser from 'phaser';
import { imageKey } from '../systems/assets';
import { taskProgressText } from '../systems/tasks';
import type { TaskState } from '../types';
import { text } from './widgets';

export interface HudData {
  hp: number;
  maxHp: number;
  coins: number;
  combo: number;
  hypeRank: string;
  hypeIndex: number;
  stream: number;
  streams: number;
  style: number;
  threshold: number;
  viewers: number;
  task: TaskState;
  bossHp: number | null;
  bossMaxHp: number;
  bossName: string;
  thresholdReached: boolean;
  isBossStream: boolean;
}

// Раскладка по референсу references/refcaht.png (ТЗ, раздел 13).
const GOAL_W = 620;
const GOAL_X = 960 - GOAL_W / 2;
const GOAL_Y = 16;
const HYPE_Y = 128;
const BOSS_W = 700;
const HP_X = 24;
const HP_Y = 1000;
const HP_W = 420;
// Цвета рангов HYPE от D до SS.
const HYPE_COLORS = [0x8a8fa3, 0x6fb1ff, 0x5ee8a0, 0xff4f9a, 0xffb13d, 0xff3d3d];

function hpBarColor(k: number): number {
  return k < 0.3 ? 0xff2a4a : 0xff5fa2;
}

// HUD стрима. Все элементы закреплены за экраном.
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private liveText: Phaser.GameObjects.Text;
  private viewersText: Phaser.GameObjects.Text;
  private streamText: Phaser.GameObjects.Text;
  private goalValue: Phaser.GameObjects.Text;
  private hypeText: Phaser.GameObjects.Text;
  private hypeLabel: Phaser.GameObjects.Text;
  private comboText: Phaser.GameObjects.Text;
  private taskText: Phaser.GameObjects.Text;
  private bossText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private coinText: Phaser.GameObjects.Text;
  readonly debugText: Phaser.GameObjects.Text;
  readonly bossArrow: Phaser.GameObjects.Image;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private lastHype = -1;

  constructor(private scene: Phaser.Scene) {
    const fix = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(200000);
      this.objs.push(o);
      return o;
    };
    const bold = { fontStyle: 'bold' };
    this.g = fix(scene.add.graphics());

    // Слева вверху: LIVE, зрители, номер стрима.
    this.liveText = fix(text(scene, 84, 46, '● LIVE', 26, '#ffffff', bold).setOrigin(0.5));
    this.viewersText = fix(text(scene, 196, 46, '', 26, '#ffffff', bold).setOrigin(0, 0.5));
    this.streamText = fix(text(scene, 30, 84, '', 22, '#d6d3e3', bold));

    // По центру: STYLE GOAL и HYPE.
    fix(text(scene, GOAL_X + 60, GOAL_Y + 12, 'STYLE GOAL', 24, '#ffffff', bold));
    this.goalValue = fix(text(scene, GOAL_X + GOAL_W - 22, GOAL_Y + 12, '', 24, '#ffffff', bold).setOrigin(1, 0));
    this.hypeText = fix(text(scene, 960, HYPE_Y, '', 34, '#ffffff', { fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5));
    this.hypeLabel = fix(text(scene, 960, HYPE_Y + 42, 'HYPE', 18, '#ffffff', bold).setOrigin(0.5));
    this.comboText = fix(text(scene, 1010, HYPE_Y, '', 26, '#ffd1e6', { fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0, 0.5));
    this.taskText = fix(text(scene, 960, HYPE_Y + 66, '', 22, '#ffe7a3', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0));
    this.bossText = fix(text(scene, 960, HYPE_Y + 124, '', 20, '#ffffff', bold).setOrigin(0.5));

    // Слева внизу: HP и монеты.
    this.hpText = fix(text(scene, HP_X + 58, HP_Y + 8, '', 24, '#ffffff', bold));
    fix(scene.add.image(HP_X + HP_W + 44, HP_Y + 30, imageKey(scene, 'coin')).setDisplaySize(30, 30));
    this.coinText = fix(text(scene, HP_X + HP_W + 66, HP_Y + 30, '', 30, '#ffffff', bold).setOrigin(0, 0.5));

    this.debugText = fix(text(scene, 960, 1066, '', 18, '#9dff8a').setOrigin(0.5, 1));
    this.bossArrow = fix(scene.add.image(0, 0, imageKey(scene, 'boss_arrow')).setVisible(false));
  }

  private heart(x: number, y: number, r: number, color: number): void {
    const g = this.g;
    g.fillStyle(color, 1);
    g.fillCircle(x - r * 0.5, y - r * 0.2, r * 0.55);
    g.fillCircle(x + r * 0.5, y - r * 0.2, r * 0.55);
    g.fillTriangle(x - r * 1.02, y, x + r * 1.02, y, x, y + r * 1.05);
  }

  private pill(x: number, y: number, w: number, h: number, fill: number, alpha = 0.78, border = 0xff5fa2): void {
    this.g.fillStyle(fill, alpha).fillRoundedRect(x, y, w, h, 14);
    this.g.lineStyle(2, border, 0.7).strokeRoundedRect(x, y, w, h, 14);
  }

  update(d: HudData): void {
    const g = this.g;
    g.clear();

    // LIVE + зрители
    this.pill(24, 22, 120, 48, 0xd81b4a, 0.95, 0xff8fb5);
    this.pill(152, 22, 180, 48, 0x140c1e);
    g.fillStyle(0xffffff, 1).fillEllipse(176, 46, 26, 16);
    g.fillStyle(0x140c1e, 1).fillCircle(176, 46, 5);
    this.viewersText.setText(d.viewers.toLocaleString('ru-RU'));
    this.streamText.setText(`Стрим ${d.stream} / ${d.streams}`);

    // STYLE GOAL
    this.pill(GOAL_X, GOAL_Y, GOAL_W, 76, 0x140c1e);
    this.heart(GOAL_X + 34, GOAL_Y + 26, 12, 0xff5fa2);
    const barX = GOAL_X + 60;
    const barW = GOAL_W - 82;
    const barY = GOAL_Y + 50;
    g.fillStyle(0x3a2440, 1).fillRoundedRect(barX, barY, barW, 12, 6);
    const sk = Phaser.Math.Clamp(Math.min(d.style, d.threshold) / d.threshold, 0, 1);
    if (sk > 0) {
      g.fillGradientStyle(0xff3d7f, 0xffb1d4, 0xff3d7f, 0xffb1d4, 1).fillRect(barX, barY, Math.max(6, barW * sk), 12);
    }
    this.goalValue.setText(`${Math.min(d.style, d.threshold)} / ${d.threshold}`);

    // HYPE
    const hc = HYPE_COLORS[Math.min(d.hypeIndex, HYPE_COLORS.length - 1)];
    g.fillStyle(0x140c1e, 0.9).fillCircle(960, HYPE_Y, 32);
    g.lineStyle(4, hc, 1).strokeCircle(960, HYPE_Y, 32);
    this.hypeText.setText(d.hypeRank).setColor(Phaser.Display.Color.IntegerToColor(hc).rgba);
    this.hypeLabel.setColor(Phaser.Display.Color.IntegerToColor(hc).rgba);
    this.comboText.setText(d.combo > 0 ? `×${d.combo}` : '');
    if (d.hypeIndex !== this.lastHype) {
      if (this.lastHype >= 0 && d.hypeIndex > this.lastHype) {
        this.scene.tweens.add({ targets: this.hypeText, scale: { from: 1.6, to: 1 }, duration: 250, ease: 'Back.easeOut' });
      }
      this.lastHype = d.hypeIndex;
    }

    // Задание
    if (d.isBossStream && d.thresholdReached && !d.task.completed) {
      this.taskText.setText('Цель закрыта — добей хейтера!');
    } else if (d.isBossStream && d.thresholdReached) {
      this.taskText.setText(`${taskProgressText(d.task)} · добей хейтера!`);
    } else {
      this.taskText.setText(`Донат: ${taskProgressText(d.task)}`);
    }

    // Босс
    if (d.bossHp !== null) {
      const bx = 960 - BOSS_W / 2;
      const by = HYPE_Y + 108;
      g.fillStyle(0x000000, 0.65).fillRoundedRect(bx - 4, by - 4, BOSS_W + 8, 38, 10);
      g.fillStyle(0x1d0b24, 1).fillRoundedRect(bx, by, BOSS_W, 30, 8);
      const bk = Phaser.Math.Clamp(d.bossHp / d.bossMaxHp, 0, 1);
      if (bk > 0) g.fillStyle(0x9b30ff, 1).fillRoundedRect(bx, by, Math.max(8, BOSS_W * bk), 30, 8);
      this.bossText.setText(`${d.bossName} — ${Math.ceil(Math.max(0, d.bossHp))}`);
    } else {
      this.bossText.setText('');
    }

    // HP
    this.pill(HP_X, HP_Y - 6, HP_W, 72, 0x140c1e);
    const hpK = Phaser.Math.Clamp(d.hp / d.maxHp, 0, 1);
    this.heart(HP_X + 30, HP_Y + 22, 13, hpBarColor(hpK));
    this.hpText.setText(`HP  ${Math.ceil(Math.max(0, d.hp))} / ${Math.round(d.maxHp)}`);
    g.fillStyle(0x3a2440, 1).fillRoundedRect(HP_X + 58, HP_Y + 42, HP_W - 80, 12, 6);
    if (hpK > 0) g.fillStyle(hpBarColor(hpK), 1).fillRoundedRect(HP_X + 58, HP_Y + 42, Math.max(8, (HP_W - 80) * hpK), 12, 6);

    // Монеты
    this.pill(HP_X + HP_W + 14, HP_Y - 6, 150, 72, 0x140c1e);
    this.coinText.setText(String(d.coins));
    this.liveText.setAlpha(0.75 + 0.25 * Math.sin(this.scene.time.now / 300));
  }

  setVisible(v: boolean): void {
    for (const o of this.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
    if (v) this.bossArrow.setVisible(false);
  }
}
