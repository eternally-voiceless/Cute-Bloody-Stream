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

const HP_W = 380;
const STYLE_W = 640;
const BOSS_W = 760;

// HUD стрима (ТЗ, раздел 13). Все элементы закреплены за экраном.
export class Hud {
  private g: Phaser.GameObjects.Graphics;
  private hpText: Phaser.GameObjects.Text;
  private coinText: Phaser.GameObjects.Text;
  private comboText: Phaser.GameObjects.Text;
  private streamText: Phaser.GameObjects.Text;
  private styleText: Phaser.GameObjects.Text;
  private liveText: Phaser.GameObjects.Text;
  private taskText: Phaser.GameObjects.Text;
  private bossText: Phaser.GameObjects.Text;
  readonly debugText: Phaser.GameObjects.Text;
  readonly bossArrow: Phaser.GameObjects.Image;
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    const fix = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(200000);
      this.objs.push(o);
      return o;
    };
    this.g = fix(scene.add.graphics());
    this.hpText = fix(text(scene, 40 + HP_W / 2, 49, '', 20, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    fix(scene.add.image(52, 96, imageKey(scene, 'coin')).setDisplaySize(26, 26));
    this.coinText = fix(text(scene, 74, 96, '', 26, '#ffd23f', { fontStyle: 'bold' }).setOrigin(0, 0.5));
    this.comboText = fix(text(scene, 40, 128, '', 24, '#ff9fd0', { fontStyle: 'bold' }));
    this.streamText = fix(text(scene, 960, 18, '', 28, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5, 0));
    this.styleText = fix(text(scene, 960, 79, '', 20, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    this.liveText = fix(text(scene, 960 + STYLE_W / 2 + 30, 79, '', 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5));
    this.taskText = fix(text(scene, 960, 108, '', 22, '#ffe7a3', {
      fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0));
    this.bossText = fix(text(scene, 960, 171, '', 20, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    this.debugText = fix(text(scene, 20, 1050, '', 18, '#9dff8a').setOrigin(0, 1));
    this.bossArrow = fix(scene.add.image(0, 0, imageKey(scene, 'boss_arrow')).setVisible(false));
  }

  update(d: HudData): void {
    const g = this.g;
    g.clear();

    // HP
    g.fillStyle(0x000000, 0.6).fillRoundedRect(36, 32, HP_W + 8, 34, 8);
    g.fillStyle(0x3a0d16, 1).fillRoundedRect(40, 36, HP_W, 26, 6);
    const hpK = Phaser.Math.Clamp(d.hp / d.maxHp, 0, 1);
    if (hpK > 0) g.fillStyle(hpK < 0.3 ? 0xff2a4a : 0xe8455f, 1).fillRoundedRect(40, 36, Math.max(12, HP_W * hpK), 26, 6);
    this.hpText.setText(`${Math.ceil(Math.max(0, d.hp))} / ${Math.round(d.maxHp)}`);
    this.coinText.setText(String(d.coins));
    this.comboText.setText(d.combo > 0 ? `Серия ×${d.combo}` : '');

    // Стрим и полоса стиля как сбор доната
    this.streamText.setText(`Стрим ${d.stream} / ${d.streams}`);
    const sx = 960 - STYLE_W / 2;
    g.fillStyle(0x000000, 0.6).fillRoundedRect(sx - 4, 60, STYLE_W + 8, 38, 10);
    g.fillStyle(0x2a1030, 1).fillRoundedRect(sx, 64, STYLE_W, 30, 8);
    const sk = Phaser.Math.Clamp(Math.min(d.style, d.threshold) / d.threshold, 0, 1);
    if (sk > 0) {
      g.fillGradientStyle(0xff3d7f, 0xffb13d, 0xff3d7f, 0xffb13d, 1).fillRect(sx, 64, Math.max(8, STYLE_W * sk), 30);
    }
    this.styleText.setText(`Сбор донатов: ${Math.min(d.style, d.threshold)} / ${d.threshold}`);

    // LIVE
    const lx = 960 + STYLE_W / 2 + 14;
    g.fillStyle(0xff2a4a, 1).fillRoundedRect(lx, 64, 150, 30, 8);
    this.liveText.setText(`● LIVE ${d.viewers}`);

    // Задание
    if (d.isBossStream && d.thresholdReached && !d.task.completed) {
      this.taskText.setText('Сбор закрыт — добей хейтера!');
    } else if (d.isBossStream && d.thresholdReached) {
      this.taskText.setText(`${taskProgressText(d.task)} · добей хейтера!`);
    } else {
      this.taskText.setText(`Донат: ${taskProgressText(d.task)}`);
    }

    // Босс
    if (d.bossHp !== null) {
      const bx = 960 - BOSS_W / 2;
      g.fillStyle(0x000000, 0.65).fillRoundedRect(bx - 4, 152, BOSS_W + 8, 38, 10);
      g.fillStyle(0x1d0b24, 1).fillRoundedRect(bx, 156, BOSS_W, 30, 8);
      const bk = Phaser.Math.Clamp(d.bossHp / d.bossMaxHp, 0, 1);
      if (bk > 0) g.fillStyle(0x9b30ff, 1).fillRoundedRect(bx, 156, Math.max(8, BOSS_W * bk), 30, 8);
      this.bossText.setText(`${d.bossName} — ${Math.ceil(Math.max(0, d.bossHp))}`);
    } else {
      this.bossText.setText('');
    }
  }

  setVisible(v: boolean): void {
    for (const o of this.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
    if (v) this.bossArrow.setVisible(false);
  }
}
