import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { imageKey } from '../systems/assets';
import { markCompleted } from '../systems/save';
import { ChatSystem } from '../systems/chat';
import { Player } from '../entities/Player';
import { deriveStats } from '../systems/stats';
import { ChatPanel } from '../ui/chatPanel';
import { button, text } from '../ui/widgets';

// Победа: вертолёт забирает героиню (ТЗ, 4.5).
export class FinalScene extends Phaser.Scene {
  private chat: ChatSystem | null = null;
  private player: Player | null = null;
  private walking = false;
  private target = { x: 0, y: 0 };
  private onArrive: (() => void) | null = null;
  private finalTimer = 0;

  constructor() { super('Final'); }

  create(): void {
    const run = ctx.run;
    if (!run) { this.scene.start('Select'); return; }
    const b = ctx.balance;
    this.walking = false;
    this.onArrive = null;
    this.finalTimer = 0;
    markCompleted(run.heroineId);

    const cx = 960;
    const cy = 600;
    this.add.tileSprite(0, 0, 1920, 1080, imageKey(this, 'arena_bg')).setOrigin(0).setDepth(-1e6);
    const stats = deriveStats(b, run.heroineId, run.statPoints);
    this.player = new Player(this, b, run.heroineId, stats, 480, 820);
    this.player.aimAt(1000, 820);
    this.player.sync(0);

    const chatPanel = new ChatPanel(this, 1556, 22, 344, 600, b.chat.maxMessages);
    this.chat = new ChatSystem(chatPanel, ctx.chat, b, run.heroineId);
    this.chat.idleCategory = '';   // фон — отдельным таймером с finalInterval
    this.chat.setState(() => ({ heroineId: run.heroineId, stream: 20 }));
    this.chat.event('final');

    const heli = this.add.image(cx, -150, imageKey(this, 'helicopter')).setDepth(10000);
    const ladder = this.add.graphics().setDepth(9999);
    const ladderTop = cy - 260;
    const title = text(this, 960, 120, `Стрим 20 / 20 пройден!`, 64, '#ffd23f', { fontStyle: 'bold', stroke: '#000000', strokeThickness: 8 })
      .setOrigin(0.5).setAlpha(0).setDepth(20000);
    this.cameras.main.fadeIn(300);

    // 1. Вертолёт опускается над центром, сбрасывает лестницу.
    this.tweens.add({
      targets: heli, y: ladderTop - 40, duration: 1800, ease: 'Sine.easeOut',
      onComplete: () => {
        const len = { v: 0 };
        this.tweens.add({
          targets: len, v: cy - ladderTop, duration: 700,
          onUpdate: () => {
            ladder.clear().lineStyle(4, 0xd1d5db, 1).lineBetween(cx, ladderTop, cx, ladderTop + len.v);
          },
          onComplete: () => this.walkTo(cx, cy, () => this.liftOff(heli, ladder, title)),
        });
      },
    });
  }

  private walkTo(x: number, y: number, done: () => void): void {
    this.walking = true;
    this.target = { x, y };
    this.onArrive = done;
  }

  // 2. Героиня поднимается вместе с вертолётом, вертолёт улетает.
  private liftOff(heli: Phaser.GameObjects.Image, ladder: Phaser.GameObjects.Graphics, title: Phaser.GameObjects.Text): void {
    const p = this.player!;
    this.tweens.add({ targets: title, alpha: 1, duration: 500 });
    const lift = { t: 0 };
    const startY = p.y;
    const heliY = heli.y;
    this.tweens.add({
      targets: lift, t: 1, duration: 1500, ease: 'Sine.easeIn',
      onUpdate: () => {
        p.y = startY - lift.t * 200;
        heli.y = heliY - lift.t * 200;
        ladder.clear().lineStyle(4, 0xd1d5db, 1).lineBetween(heli.x, heli.y + 40, heli.x, p.y);
      },
      onComplete: () => {
        const fly = { t: 0 };
        const hx = heli.x;
        const hy = heli.y;
        this.tweens.add({
          targets: fly, t: 1, duration: 2000, ease: 'Sine.easeIn',
          onUpdate: () => {
            heli.setPosition(hx + fly.t * 1400, hy - fly.t * 500);
            p.x = heli.x;
            p.y = heli.y + 200;
            ladder.clear().lineStyle(4, 0xd1d5db, 1).lineBetween(heli.x, heli.y + 40, p.x, p.y);
          },
          onComplete: () => {
            ladder.clear();
            button(this, 960, 900, 460, 80, 'К выбору героини', () => {
              ctx.run = null;
              this.scene.start('Select');
            }).setDepth(20000);
          },
        });
      },
    });
  }

  update(_t: number, dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    // 3. Чат заполняется финальными сообщениями.
    this.finalTimer += dt;
    if (this.finalTimer > (ctx.balance.chat.finalInterval ?? 0.8)) {
      this.finalTimer = 0;
      this.chat?.event('final');
    }
    this.chat?.update(dt);
    const p = this.player;
    if (!p) return;
    if (this.walking) {
      const dx = this.target.x - p.x;
      const dy = this.target.y - p.y;
      const d = Math.hypot(dx, dy);
      const step = p.stats.moveSpeed * dt;
      if (d <= step) {
        p.x = this.target.x;
        p.y = this.target.y;
        p.moving = false;
        this.walking = false;
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.();
      } else {
        p.move(dt, dx, dy);
      }
    } else {
      p.moving = false;
    }
    p.sync(dt);
  }
}
