import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { hasImage, imageKey } from '../systems/assets';
import { floorSprite } from '../systems/arena';
import { markCompleted } from '../systems/save';
import { ChatSystem } from '../systems/chat';
import { Player } from '../entities/Player';
import { deriveStats } from '../systems/stats';
import { ChatPanel } from '../ui/chatPanel';
import { button, text } from '../ui/widgets';

type Ladder = Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;

// Точка крепления лестницы относительно центра вертолёта (у двери, снизу).
const LADDER_DX = 30;
const LADDER_DY = 70;

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
    floorSprite(this, 0, 0, 1920, 1080);
    const stats = deriveStats(b, run.heroineId, run.statPoints);
    this.player = new Player(this, b, run.heroineId, stats, 480, 820);
    this.player.aimAt(1000, 820);
    this.player.sync(0);

    const chatPanel = new ChatPanel(this, 1556, 22, 344, 600, b.chat.maxMessages);
    this.chat = new ChatSystem(chatPanel, ctx.chat, b, run.heroineId);
    this.chat.idleCategory = '';   // фон — отдельным таймером с finalInterval
    this.chat.setState(() => ({ heroineId: run.heroineId, stream: 20 }));
    this.chat.event('final');

    const heli = this.add.image(cx - LADDER_DX, -200, imageKey(this, 'helicopter')).setDepth(10000);
    const ladder = this.makeLadder();
    const ladderTop = cy - 260;
    const title = text(this, 960, 780, `Стрим 20 / 20 пройден!`, 64, '#ffd23f', { fontStyle: 'bold', stroke: '#000000', strokeThickness: 8 })
      .setOrigin(0.5).setAlpha(0).setDepth(20000);
    this.cameras.main.fadeIn(300);

    // Вертолёт слегка покачивается в воздухе.
    this.tweens.add({ targets: heli, angle: { from: -1.2, to: 1.2 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 1. Вертолёт опускается над центром, сбрасывает лестницу.
    this.tweens.add({
      targets: heli, y: ladderTop - LADDER_DY, duration: 1800, ease: 'Sine.easeOut',
      onComplete: () => {
        const len = { v: 0 };
        this.tweens.add({
          targets: len, v: cy - ladderTop + 20, duration: 700,
          onUpdate: () => this.drawLadder(ladder, heli, len.v),
          onComplete: () => this.walkTo(cx, cy, () => this.liftOff(heli, ladder, title)),
        });
      },
    });
  }

  /** Верёвочная лестница: картинка, которая «разматывается» сверху вниз; без картинки — линия. */
  private makeLadder(): Ladder {
    if (hasImage(this, 'ladder')) return this.add.image(0, 0, imageKey(this, 'ladder')).setOrigin(0.5, 0).setDepth(9999).setVisible(false);
    return this.add.graphics().setDepth(9999);
  }

  private drawLadder(ladder: Ladder, heli: Phaser.GameObjects.Image, len: number, toX?: number): void {
    const x = heli.x + LADDER_DX;
    const y = heli.y + LADDER_DY;
    if (ladder instanceof Phaser.GameObjects.Graphics) {
      ladder.clear().lineStyle(4, 0xd1d5db, 1).lineBetween(x, y, toX ?? x, y + len);
      return;
    }
    const h = Math.min(len, ladder.height);
    // Низ лестницы тянется за героиней, если она сбоку.
    const tilt = toX === undefined ? 0 : Math.atan2(x - toX, len);
    ladder.setVisible(len > 0).setPosition(x, y).setCrop(0, 0, ladder.width, h).setRotation(tilt);
  }

  private walkTo(x: number, y: number, done: () => void): void {
    this.walking = true;
    this.target = { x, y };
    this.onArrive = done;
  }

  // 2. Героиня поднимается вместе с вертолётом, вертолёт улетает.
  private liftOff(heli: Phaser.GameObjects.Image, ladder: Ladder, title: Phaser.GameObjects.Text): void {
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
        this.drawLadder(ladder, heli, p.y - heli.y - LADDER_DY + 20);
      },
      onComplete: () => {
        const fly = { t: 0 };
        const hx = heli.x;
        const hy = heli.y;
        this.tweens.add({
          targets: fly, t: 1, duration: 2000, ease: 'Sine.easeIn',
          onUpdate: () => {
            heli.setPosition(hx + fly.t * 1400, hy - fly.t * 500);
            p.x = heli.x + LADDER_DX;
            p.y = heli.y + LADDER_DY + 220;
            this.drawLadder(ladder, heli, p.y - heli.y - LADDER_DY + 20, p.x);
          },
          onComplete: () => {
            ladder.setVisible(false);
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
