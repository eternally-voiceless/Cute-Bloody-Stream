import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { imageKey } from '../systems/assets';
import { createStream, threshold, viewers } from '../systems/run';
import { deriveStats, type DerivedStats } from '../systems/stats';
import { hypeRank, killFlags, killStyle, type KillFlags } from '../systems/style';
import { plural, taskText } from '../systems/tasks';
import { SpawnSystem } from '../systems/spawn';
import { Blood } from '../systems/blood';
import { buildArena, type Arena } from '../systems/arena';
import { ChatSystem, takeViewersMilestone, type ChatState } from '../systems/chat';
import { loadProgress } from '../systems/save';
import { Player } from '../entities/Player';
import { Enemy, type ChaseInfo } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { playSound } from '../systems/sound';
import { loadManualAim, onSettingsOpen, saveManualAim } from '../systems/settings';
import { setShopDuck, startRunMusic } from '../systems/music';
import { Projectile, segmentHitsCircle } from '../entities/Projectile';
import { Coin } from '../entities/Coin';
import { ChatPanel } from '../ui/chatPanel';
import { Hud } from '../ui/hud';
import { DamageNumbers } from '../ui/damageNumbers';
import { button, panel, text } from '../ui/widgets';
import type { Balance, RunState, StreamState } from '../types';

const STREAMS = 20;

type Target = Enemy | Boss;

// Стрим: intro → fight → settle → summary (ТЗ, 4.2, 10).
export class NightScene extends Phaser.Scene {
  private b!: Balance;
  private run!: RunState;
  private st!: StreamState;
  private stats!: DerivedStats;
  private player!: Player;
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private projectiles: Projectile[] = [];
  private coins: Coin[] = [];
  private spawn!: SpawnSystem;
  private chat!: ChatSystem;
  private chatPanel!: ChatPanel;
  private hud!: Hud;
  private numbers!: DamageNumbers;
  private blood!: Blood;
  private bossLine!: Phaser.GameObjects.Graphics;
  private arena!: Arena;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private paused = false;
  private ended = false;
  private volley = 0;
  private comboTimer = 0;
  private noHitTimer = 0;
  private lowHpWarned = false;
  private donor = '';
  private taskNearSent = false;
  private bossHalfSent = false;
  private cleared = false;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private exitMenu: Phaser.GameObjects.GameObject[] = [];
  private leaving = false;
  private introDom: Phaser.GameObjects.DOMElement | null = null;
  private controlsDom: Phaser.GameObjects.DOMElement | null = null;
  /** Ручной режим стрельбы (Q): прицел по мыши, огонь при зажатой ЛКМ. */
  private manual = false;
  private dashHit = new Set<number>();
  // Нажатия F и пробела копятся до шага боя: короткое нажатие не теряется, даже если отпущено в том же кадре.
  private wantPush = false;
  private wantDash = false;
  private ghostT = 0;
  private toast: Phaser.GameObjects.Text | null = null;

  constructor() { super('Night'); }

  create(): void {
    if (!ctx.run) { this.scene.start('Select'); return; }
    this.b = ctx.balance;
    this.run = ctx.run;
    this.enemies = [];
    this.projectiles = [];
    this.coins = [];
    this.boss = null;
    this.paused = false;
    this.ended = false;
    this.volley = 0;
    this.comboTimer = 0;
    this.noHitTimer = 0;
    this.lowHpWarned = false;
    this.taskNearSent = false;
    this.bossHalfSent = false;
    this.overlay = [];
    this.exitMenu = [];
    this.leaving = false;
    this.introDom = null;
    this.controlsDom = null;
    this.manual = loadManualAim();
    this.dashHit = new Set();
    this.wantPush = false;
    this.wantDash = false;
    this.ghostT = 0;
    this.toast = null;
    setShopDuck(false);

    const b = this.b;
    this.st = this.run.current = createStream(b, this.run);
    this.stats = deriveStats(b, this.run.heroineId, this.run.statPoints);
    const a = b.world.arena;

    // Арена: пол, полоса за линией с объектами, линия границы (assets.json → arena).
    this.arena = buildArena(this);
    const border = this.arena.border;

    this.player = new Player(this, b, this.run.heroineId, this.stats, a.width / 2, a.height / 2);
    this.player.ammo = this.stats.weapon.magazine ?? 0;
    this.player.hp = this.stats.maxHp;   // intro: HP до максимума
    this.player.sync(0);

    const cam = this.cameras.main;
    cam.setBounds(-border, -border, a.width + 2 * border, a.height + 2 * border);
    cam.startFollow(this.player.view, true, b.world.camera.lerp, b.world.camera.lerp);
    cam.fadeIn(250);

    this.spawn = new SpawnSystem(this, b, this.run.stream);
    this.bossLine = this.add.graphics().setDepth(-400);
    this.numbers = new DamageNumbers(this);
    this.blood = new Blood(this, -1e6 + 2);

    this.chatPanel = new ChatPanel(this, 1556, 22, 344, 600, b.chat.maxMessages);
    this.chat = new ChatSystem(this.chatPanel, ctx.chat, b, this.run.heroineId);
    // Один донатер на карточку и чат.
    this.donor = ctx.chat.nicks[Math.floor(Math.random() * ctx.chat.nicks.length)] ?? 'viewer';
    this.cleared = loadProgress().completed[this.run.heroineId];
    this.chat.setState(() => this.chatState());
    this.hud = new Hud(this);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC,F9,Q,F,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (e: KeyboardEvent) => {
      // Q на карточке переключает режим стрельбы и не начинает бой.
      if (e.code === 'KeyQ') { if (this.st.phase === 'intro' || this.st.phase === 'fight') this.toggleAim(); }
      else if (this.st.phase === 'fight' && !e.repeat && (e.code === 'KeyF' || e.code === 'Space')) {
        if (e.code === 'KeyF') this.wantPush = true;
        else this.wantDash = true;
      }
      else if (this.st.phase === 'intro' && e.code !== 'Escape') this.startFight();
      // Итоги стрима: пробел или Enter — «Дальше».
      else if (this.st.phase === 'summary' && this.exitMenu.length === 0 && (e.code === 'Space' || e.code === 'Enter')) this.next();
    });
    this.input.on('pointerdown', () => { if (this.st.phase === 'intro') this.startFight(); });
    this.keys.ESC.on('down', () => {
      if (this.st.phase === 'fight' && !this.ended) this.togglePause();
      else if (this.st.phase === 'summary') this.toggleExitMenu();
    });
    this.keys.F9.on('down', () => { if (ctx.debug.enabled && this.st.phase === 'fight') this.debugFinish(); });
    // Открыли настройки посреди боя — стрим встаёт на паузу.
    const offSettings = onSettingsOpen(() => { if (this.st.phase === 'fight' && !this.ended && !this.paused) this.togglePause(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offSettings);

    this.showIntro();
    this.chat.event('stream_start', { n: this.run.stream });
    this.time.delayedCall(600, () => this.chat.event('task_new'));
    this.updateHud();
  }

  // ---------- intro ----------

  private showIntro(): void {
    const t = this.st.task;
    const el = document.createElement('div');
    el.className = 'donation';
    el.innerHTML =
      `<div class="d-head">Стрим ${this.run.stream} / ${STREAMS}${this.st.isBossStream ? ' · БОСС' : ''}</div>` +
      `<div class="d-nick"></div><div class="d-amount">${t.reward} ${plural(t.reward, 'монета', 'монеты', 'монет')}</div>` +
      `<div class="d-text"></div><div class="d-hint">Нажмите любую клавишу</div>`;
    (el.querySelector('.d-nick') as HTMLElement).textContent = `донат от ${this.donor}`;
    (el.querySelector('.d-text') as HTMLElement).textContent = taskText(t);
    const first = this.run.stream === 1;
    this.introDom = this.add.dom(960, first ? 320 : 500, el).setOrigin(0.5).setScrollFactor(0).setDepth(2000);
    this.introDom.pointerEvents = 'none';  // клик по карточке тоже запускает бой
    if (first) this.showControls();
    const dim = this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.55).setScrollFactor(0).setDepth(150000);
    this.overlay.push(dim);
  }

  /** Сводка управления: только на первом стриме забега, там же выбор режима стрельбы. */
  private showControls(): void {
    const el = document.createElement('div');
    el.className = 'controls';
    const row = (k: string, t: string) => `<div class="c-key">${k}</div><div class="c-text">${t}</div>`;
    const ab = this.b.abilities;
    el.innerHTML =
      `<div class="c-title">Управление</div>` +
      `<div class="c-grid">` +
      row('WASD / стрелки', 'движение') +
      row('Q', 'авто / ручная стрельба') +
      row('ЛКМ', 'огонь в ручном режиме, прицел — мышью') +
      row('F', `оттолкнуть врагов · ${String(ab.push.cooldown).replace('.', ',')} с`) +
      row('Пробел', `рывок сквозь толпу · ${ab.dash.cooldown} с`) +
      row('Esc', 'пауза') +
      `</div>` +
      `<div class="c-mode"><span>Стрельба:</span>` +
      `<button type="button" data-mode="auto">Авто</button><button type="button" data-mode="manual">Ручная (мышь)</button></div>`;
    el.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if ((btn.dataset.mode === 'manual') !== this.manual) this.toggleAim();
      });
    });
    this.controlsDom = this.add.dom(960, 785, el).setOrigin(0.5).setScrollFactor(0).setDepth(2000);
    this.syncControls();
  }

  private syncControls(): void {
    const el = this.controlsDom?.node as HTMLElement | undefined;
    el?.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((btn) => {
      btn.classList.toggle('on', (btn.dataset.mode === 'manual') === this.manual);
    });
  }

  private toggleAim(): void {
    this.manual = !this.manual;
    saveManualAim(this.manual);
    this.syncControls();
    if (this.st.phase !== 'fight') return;
    // Короткая подсказка внизу экрана.
    this.toast?.destroy();
    const t = text(this, 960, 900, this.manual ? 'Ручная стрельба: ЛКМ' : 'Автострельба', 30, '#ffffff', { fontStyle: 'bold', stroke: '#000000', strokeThickness: 6 })
      .setOrigin(0.5).setScrollFactor(0).setDepth(250000);
    this.toast = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => { t.destroy(); if (this.toast === t) this.toast = null; } });
  }

  private startFight(): void {
    this.clearOverlay();
    this.introDom?.destroy();
    this.introDom = null;
    this.controlsDom?.destroy();
    this.controlsDom = null;
    this.st.phase = 'fight';
    if (this.st.isBossStream) this.spawnBoss();
    startRunMusic();
  }

  private clearOverlay(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
  }

  // ---------- главный цикл ----------

  update(_t: number, dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    if (this.paused) return;
    this.chat.update(dt, this.st.combo);
    this.numbers.update(dt);
    this.blood.update(dt);
    // speed > 1 только в отладке: несколько шагов боя за кадр.
    for (let i = 0; i < ctx.debug.speed; i++) {
      if (this.st.phase === 'fight' && !this.ended) this.fightStep(dt);
      else this.idleStep(dt);
    }
    this.player.sync(dt);
    this.arena.update(this.player.x, this.player.y);
    this.updateHud();
  }

  private idleStep(dt: number): void {
    for (const e of this.enemies) if (e.active && e.dying) e.updateDying(dt);
    if (this.boss?.dying) this.boss.updateDying(dt);
    this.bossLine.clear();
    this.hud.bossArrow.setVisible(false);
  }

  private fightStep(dt: number): void {
    const b = this.b;
    const st = this.st;
    const p = this.player;
    const a = b.world.arena;
    st.elapsed += dt;

    // 1. Движение героини и врагов, появление врагов.
    const k = this.keys;
    const ix = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const iy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    p.tick(dt);
    this.abilities(ix, iy);
    p.move(dt, ix, iy);
    if (p.dashT > 0) this.dashStep(dt);
    if (p.hp < this.stats.maxHp) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.regenPerSec * dt);
    if (this.lowHpWarned && p.hp >= this.stats.maxHp * (b.chat.lowHpOkRatio ?? b.player.lowHpRatio)) {
      this.lowHpWarned = false;
      this.chat.event('low_hp_ok');
    }

    let alive = 0;
    const counts: Record<string, number> = {};
    let caneFree = true;
    for (const e of this.enemies) if (e.active && !e.dying && e.caneBusy) caneFree = false;
    const info: ChaseInfo = { x: p.x, y: p.y, r: p.radius, vx: p.vx, vy: p.vy, speed: this.stats.moveSpeed, caneFree };
    let holder = false;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.dying) { e.updateDying(dt); continue; }
      e.update(dt, info, a.width, a.height);
      if (e.caneBusy) info.caneFree = false;
      if (e.grabbing) holder = true;
      counts[e.typeId] = (counts[e.typeId] ?? 0) + 1;
      alive++;
    }
    if (holder && !p.rooted && p.dashT <= 0) this.chat.event('player_grabbed');
    p.rooted = holder && p.dashT <= 0;
    this.separate();
    for (const e of this.enemies) if (e.active && !e.dying) e.sync(dt);

    const boss = this.boss;
    if (boss && boss.active) {
      if (boss.dying) boss.updateDying(dt);
      else {
        if (boss.update(dt, p.x, p.y, p.radius)) alive += this.summon(alive);
        if (boss.justTelegraphed) {
          boss.justTelegraphed = false;
          this.chat.event('boss_dash');
        }
        boss.sync(dt);
      }
    }
    this.drawBossLine();

    for (const o of this.spawn.update(dt, alive, p.x, p.y, counts)) this.spawnEnemy(o.type, o.x, o.y, false);

    // 2. Выстрелы и попадания → смерти → стиль, серия, задание, дроп.
    this.shoot(dt);
    this.updateProjectiles(dt);
    if (st.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) st.combo = 0;
    }
    if (st.task.type === 'noHit' && this.taskOpen()) {
      this.noHitTimer += dt;
      st.task.progress = this.noHitTimer;
      this.checkTaskNear();
      this.checkTask();
    }
    this.updateCoins(dt);

    // 3. Урон героине от касаний.
    this.contactDamage();

    // 4. Завершение (побеждает при одновременной смерти).
    if (st.thresholdReached && (!st.isBossStream || st.bossDead)) {
      this.beginSettle();
      return;
    }
    // 5. Смерть.
    if (p.hp <= 0) this.onDeath();
  }

  // ---------- способности: F — оттолкнуть, пробел — рывок ----------

  private abilities(ix: number, iy: number): void {
    const p = this.player;
    const push = this.wantPush, dash = this.wantDash;
    this.wantPush = this.wantDash = false;
    if (push && p.pushCd <= 0) this.push();
    if (dash && p.dashCd <= 0 && p.dashT <= 0) {
      this.releaseGrabs();
      this.dashHit.clear();
      this.ghostT = 0;
      p.dash(ix, iy);
    }
  }

  private releaseGrabs(): void {
    for (const e of this.enemies) if (e.active && !e.dying) e.releaseGrab();
    this.player.rooted = false;
  }

  private push(): void {
    const p = this.player;
    const c = this.b.abilities.push;
    p.pushCd = c.cooldown;
    this.releaseGrabs();
    for (const e of this.enemies) {
      if (!e.active || e.dying) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > c.radius + e.radius) continue;
      // Ближних толкает сильнее.
      e.knock(dx || 1, dy, c.force * (1 - 0.4 * d / (c.radius + e.radius)), c.resistFactor);
    }
    // Волна от героини.
    const ring = this.add.circle(p.x, p.y, 20).setStrokeStyle(6, 0xffe066, 0.9).setDepth(p.y + 1);
    this.tweens.add({
      targets: ring, radius: c.radius, alpha: 0, duration: 260, ease: 'Quad.easeOut',
      onUpdate: () => ring.setPosition(this.player.x, this.player.y),
      onComplete: () => ring.destroy(),
    });
    this.cameras.main.shake(80, 0.002);
  }

  /** Шаг рывка: враги на пути разлетаются в стороны, за героиней — шлейф. */
  private dashStep(dt: number): void {
    const p = this.player;
    const c = this.b.abilities.dash;
    const len = Math.hypot(p.vx, p.vy) || 1;
    const fx = p.vx / len, fy = p.vy / len;
    for (const e of this.enemies) {
      if (!e.active || e.dying || this.dashHit.has(e.id)) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (Math.hypot(dx, dy) > c.pushRadius + e.radius) continue;
      this.dashHit.add(e.id);
      // В сторону от линии рывка и немного вперёд.
      const side = dx * fy - dy * fx >= 0 ? -1 : 1;
      e.knock(-fy * side + fx * 0.3, fx * side + fy * 0.3, c.force, 0.5);
    }
    this.ghostT -= dt;
    if (this.ghostT <= 0) {
      this.ghostT = 0.035;
      const v = p.view;
      const g = this.add.image(v.x, v.y, v.texture.key, v.frame.name)
        .setOrigin(v.originX, v.originY).setScale(v.scaleX, v.scaleY).setFlipX(v.flipX)
        .setTint(0xff7fbf).setAlpha(0.55).setDepth(p.y - 0.5);
      this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    }
  }

  // ---------- враги ----------

  private spawnEnemy(type: string, x: number, y: number, summoned: boolean): void {
    const cfg = this.b.enemies[type];
    if (!cfg) return;
    let e = this.enemies.find((q) => !q.active && q.typeId === type);
    if (!e) {
      e = new Enemy(this, type, cfg);
      this.enemies.push(e);
    }
    e.spawn(this.b, x, y, this.run.stream, summoned);
  }

  private separate(): void {
    const list = this.enemies;
    const f = this.b.world.separation;
    for (let i = 0; i < list.length; i++) {
      const e1 = list[i];
      if (!e1.active || e1.dying) continue;
      for (let j = i + 1; j < list.length; j++) {
        const e2 = list[j];
        if (!e2.active || e2.dying) continue;
        const dx = e2.x - e1.x;
        const dy = e2.y - e1.y;
        const r = e1.radius + e2.radius;
        if (Math.abs(dx) >= r || Math.abs(dy) >= r) continue;
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        const push = ((r - d) * f) / 2;
        const nx = d > 0 ? dx / d : Math.random() - 0.5;
        const ny = d > 0 ? dy / d : Math.random() - 0.5;
        e1.x -= nx * push; e1.y -= ny * push;
        e2.x += nx * push; e2.y += ny * push;
      }
    }
  }

  private aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.active && !e.dying) n++;
    return n;
  }

  // ---------- босс ----------

  private spawnBoss(): void {
    const b = this.b;
    const a = b.world.arena;
    const r = b.boss.size / 2;
    const off = b.boss.spawnOffset + r;
    const v = this.cameras.main.worldView;
    const sides = Phaser.Utils.Array.Shuffle(['left', 'right', 'top', 'bottom']);
    let pos: { x: number; y: number } | null = null;
    for (const s of sides) {
      const ry = Phaser.Math.FloatBetween(Math.max(r, v.y), Math.min(a.height - r, v.bottom));
      const rx = Phaser.Math.FloatBetween(Math.max(r, v.x), Math.min(a.width - r, v.right));
      const c =
        s === 'left' ? { x: v.x - off, y: ry } :
        s === 'right' ? { x: v.right + off, y: ry } :
        s === 'top' ? { x: rx, y: v.y - off } :
        { x: rx, y: v.bottom + off };
      if (c.x >= r && c.x <= a.width - r && c.y >= r && c.y <= a.height - r) { pos = c; break; }
    }
    if (!pos) {
      // Нет места за камерой — у границы видимой области с меткой.
      pos = { x: Phaser.Math.Clamp(v.x + r, r, a.width - r), y: Phaser.Math.Clamp(v.y + r, r, a.height - r) };
      const m = this.add.image(pos.x, pos.y, imageKey(this, 'spawn_marker')).setScale(3).setDepth(-500);
      this.tweens.add({ targets: m, alpha: 0, duration: 1500, onComplete: () => m.destroy() });
    }
    this.boss = new Boss(this, b, pos.x, pos.y, this.run.stream);
    this.boss.sync(0);
    this.chat.event('boss_spawn');
  }

  private summon(alive: number): number {
    const boss = this.boss!;
    const c = this.b.boss.summon;
    const n = Math.max(0, Math.min(c.count, this.b.spawn.maxAlive - alive - this.spawn.pendingCount));
    for (let i = 0; i < n; i++) {
      const ang = (i / Math.max(1, n)) * Math.PI * 2;
      const d = boss.radius + 40;
      this.spawnEnemy('walker', boss.x + Math.cos(ang) * d, boss.y + Math.sin(ang) * d, true);
    }
    if (n > 0) this.chat.event('boss_summon');
    return n;
  }

  private drawBossLine(): void {
    const g = this.bossLine;
    g.clear();
    // Охотник: красная прямая на время замирания. Сталкер: тонкая линия на замахе.
    const pulse = Math.abs(Math.sin(this.time.now / 60));
    for (const e of this.enemies) {
      if (!e.active || e.dying) continue;
      if (e.mode === 'freeze') {
        const L = e.leapLength;
        g.lineStyle(e.radius * 0.9, 0xff2a4a, 0.3 + 0.25 * pulse);
        g.lineBetween(e.x, e.y, e.x + e.dirX * L, e.y + e.dirY * L);
      } else if (e.mode === 'cast') {
        g.lineStyle(4, 0xb45cff, 0.25 + 0.3 * pulse);
        g.lineBetween(e.x, e.y - e.radius, this.player.x, this.player.y);
      }
    }
    const boss = this.boss;
    if (!boss || !boss.active || boss.dying || boss.state !== 'telegraph') return;
    const d = this.b.boss.dash.distance;
    g.lineStyle(boss.radius * 0.8, 0xff2a4a, 0.25 + 0.2 * Math.abs(Math.sin(this.time.now / 80)));
    g.lineBetween(boss.x, boss.y, boss.x + boss.dashDirX * d, boss.y + boss.dashDirY * d);
  }

  private updateBossArrow(): void {
    const arrow = this.hud.bossArrow;
    const boss = this.boss;
    const v = this.cameras.main.worldView;
    if (!boss || !boss.active || boss.dying || this.st.phase !== 'fight' ||
        Phaser.Geom.Rectangle.Overlaps(v, new Phaser.Geom.Rectangle(boss.x - boss.radius, boss.y - boss.radius, boss.radius * 2, boss.radius * 2))) {
      arrow.setVisible(false);
      return;
    }
    const sx = boss.x - v.x;
    const sy = boss.y - v.y;
    const ang = Math.atan2(sy - 540, sx - 960);
    const m = 50;
    arrow.setVisible(true).setRotation(ang)
      .setPosition(Phaser.Math.Clamp(sx, m, 1920 - m), Phaser.Math.Clamp(sy, m, 1080 - m));
  }

  // ---------- стрельба ----------

  private findTarget(): Target | null {
    const p = this.player;
    const range = this.stats.range;
    const boss = this.boss;
    if (boss && boss.active && !boss.dying && Math.hypot(boss.x - p.x, boss.y - p.y) <= range) return boss;
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (!e.active || e.dying) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private shoot(dt: number): void {
    const p = this.player;
    const s = this.stats;
    const w = s.weapon;
    const period = 1 / s.fireRate;
    p.fireTimer -= dt;
    // Перезарядка магазина: во время неё не стреляем и не копим выстрелы.
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      p.fireTimer = Math.max(p.fireTimer, 0);
      if (p.reloadT <= 0) p.ammo = w.magazine ?? 0;
    }
    let target: { x: number; y: number } | null;
    if (this.manual) {
      // Ручной режим: прицел по мыши всегда, огонь — пока зажата ЛКМ.
      const ptr = this.input.activePointer;
      const wp = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      p.aimAt(wp.x, wp.y);
      target = ptr.isDown && ptr.leftButtonDown() ? wp : null;
    } else {
      target = this.findTarget();
      if (target) p.aimAt(target.x, target.y);
    }
    if (!target) {
      p.fireTimer = Math.max(p.fireTimer, 0);
      return;
    }
    if (p.reloadT > 0 || p.fireTimer > 0) return;
    p.fireTimer = Math.max(p.fireTimer + period, 0);
    const m = p.barrelTip;
    const base = Math.atan2(target.y - p.muzzle.y, target.x - p.muzzle.x);
    this.volley++;
    for (let i = 0; i < w.pellets; i++) {
      const spread = Phaser.Math.DegToRad(Phaser.Math.FloatBetween(-w.spread / 2, w.spread / 2));
      this.getProjectile().fire(m.x, m.y, base + spread, w.projectileSpeed, s.range, s.damage, w.pierce, this.volley);
    }
    playSound(this, `fire_${s.weaponId}`, { period, speedup: s.fireRate / w.fireRate });
    if (w.magazine) {
      p.ammo--;
      if (p.ammo <= 0) {
        p.reloadT = w.reloadTime ?? 1;
        playSound(this, `reload_${s.weaponId}`);
      }
    }
  }

  private getProjectile(): Projectile {
    let pr = this.projectiles.find((q) => !q.active);
    if (!pr) {
      const img = this.add.image(0, 0, imageKey(this, `projectile_${this.stats.weaponId}`));
      // У лазера светящаяся линия тянется за точкой снаряда.
      img.setOrigin(this.stats.weaponId === 'laser' ? 1 : 0.5, 0.5);
      pr = new Projectile(img);
      this.projectiles.push(pr);
    }
    return pr;
  }

  private updateProjectiles(dt: number): void {
    const hits: { t: Target; d: number }[] = [];
    for (const pr of this.projectiles) {
      if (!pr.active) continue;
      const alive = pr.step(dt);
      hits.length = 0;
      const boss = this.boss;
      if (boss && boss.active && !boss.dying && !pr.hit.has(boss.id) &&
          segmentHitsCircle(pr.px, pr.py, pr.x, pr.y, boss.x, boss.y, boss.radius)) {
        hits.push({ t: boss, d: Math.hypot(boss.x - pr.px, boss.y - pr.py) });
      }
      for (const e of this.enemies) {
        if (!e.active || e.dying || pr.hit.has(e.id)) continue;
        if (segmentHitsCircle(pr.px, pr.py, pr.x, pr.y, e.x, e.y, e.radius)) {
          hits.push({ t: e, d: Math.hypot(e.x - pr.px, e.y - pr.py) });
        }
      }
      if (hits.length > 1) hits.sort((h1, h2) => h1.d - h2.d);
      for (const h of hits) {
        if (pr.hitsLeft <= 0) break;
        this.applyHit(pr, h.t);
      }
      if (pr.hitsLeft <= 0 || !alive) pr.release();
    }
  }

  private applyHit(pr: Projectile, t: Target): void {
    const w = this.stats.weapon;
    const crit = Math.random() * 100 < this.stats.critChance;
    const dmg = pr.damage * (crit ? w.critMultiplier : 1);
    t.hp -= dmg;
    t.hit();
    pr.hit.add(t.id);
    pr.hitsLeft--;
    pr.damage *= w.pierceDamageFactor;
    this.numbers.show(t.x, t.y - t.radius, dmg, crit);
    this.blood.hit(t.x, t.y, pr.dirX, pr.dirY);
    if (w.knockback > 0 && t.lastKnockVolley !== pr.volley && !t.isBoss) {
      t.lastKnockVolley = pr.volley;
      (t as Enemy).knock(pr.dirX, pr.dirY, w.knockback);
    }
    if (t.isBoss && !this.bossHalfSent && t.hp > 0 && t.hp <= (t as Boss).maxHp / 2) {
      this.bossHalfSent = true;
      this.chat.event('boss_half');
    }
    if (t.hp <= 0) this.onKill(t, crit, pr.dirX, pr.dirY);
  }

  // ---------- убийства, стиль, задание ----------

  private taskOpen(): boolean {
    const st = this.st;
    return !st.task.completed && !(st.isBossStream && st.thresholdReached);
  }

  private onKill(t: Target, crit: boolean, dirX = 0, dirY = 1): void {
    const st = this.st;
    const p = this.player;
    const dist = Math.hypot(t.x - p.x, t.y - p.y);
    const flags = killFlags(this.b, { crit, dist, range: this.stats.range });
    // Размер брызг и пятна — по размеру врага (шатун = 1).
    this.blood.kill(t.x, t.y, dirX, dirY, t.isBoss ? 3 : t.radius / 20);
    t.die();

    if (t.isBoss) {
      st.styleRaw += this.b.boss.style;
      st.bossDead = true;
      st.kills++;
      if (this.taskOpen()) this.advanceTask(flags);
      this.chat.event('boss_kill');
      this.cameras.main.shake(300, 0.008);
      this.checkThreshold();
      return;
    }

    // После порога на стриме с боссом обычные и призванные враги ничего не дают.
    if (st.isBossStream && st.thresholdReached) return;

    const e = t as Enemy;
    st.styleRaw += killStyle(this.b, this.run.heroineId, {
      enemyStyle: e.style, crit, dist, range: this.stats.range, combo: st.combo,
    });
    st.kills++;
    const rankBefore = hypeRank(this.b, st.combo).index;
    st.combo++;
    const rankAfter = hypeRank(this.b, st.combo);
    this.comboTimer = this.b.style.comboWindow;
    if (this.taskOpen()) this.advanceTask(flags);
    if (Math.random() * 100 < this.stats.dropChance) this.dropCoin(e.x, e.y);

    const ev = { enemyId: e.typeId, variant: e.view.variant };
    this.chat.event('kill', ev);
    if (flags.crit) this.chat.event('crit', ev);
    if (flags.longShot) this.chat.event('long_shot', ev);
    if (flags.close) this.chat.event('close_kill', ev);
    const rankUp = rankAfter.index > rankBefore;
    if (rankUp) this.chat.event('rank_up', { rank: rankAfter.rank });
    else if (st.combo > 0 && st.combo % 10 === 0) this.chat.event('combo', { n: st.combo, combo: st.combo });
    this.checkThreshold();
  }

  private advanceTask(f: KillFlags): void {
    const t = this.st.task;
    switch (t.type) {
      case 'kills': t.progress++; break;
      case 'crits': if (f.crit) t.progress++; break;
      case 'longShots': if (f.longShot) t.progress++; break;
      case 'closeKills': if (f.close) t.progress++; break;
      case 'combo': t.progress = Math.max(t.progress, this.st.combo); break;
      case 'noHit': break;
    }
    this.checkTaskNear();
    this.checkTask();
  }

  /** Задание почти выполнено: реплика чата один раз за стрим. */
  private checkTaskNear(): void {
    const t = this.st.task;
    const c = this.b.chat;
    if (this.taskNearSent || t.completed || t.target < (c.taskNearMinTarget ?? 4)) return;
    if (t.progress / t.target < (c.taskNearRatio ?? 0.75) || t.progress >= t.target) return;
    this.taskNearSent = true;
    this.chat.event('task_near');
  }

  private checkTask(): void {
    const t = this.st.task;
    if (t.completed || t.progress < t.target) return;
    t.completed = true;
    if (!t.rewardPaid) {
      t.rewardPaid = true;
      this.run.coins += t.reward;
    }
    this.chat.event('task_done');
  }

  private checkThreshold(): void {
    const st = this.st;
    if (st.thresholdReached || st.styleRaw < threshold(this.b, this.run.stream)) return;
    st.thresholdReached = true;
    if (st.isBossStream) this.spawn.stop();
    if (st.isBossStream && !st.bossDead) this.chat.event('goal_reached');
  }

  // ---------- монеты ----------

  private dropCoin(x: number, y: number): void {
    let c = this.coins.find((q) => !q.active);
    if (!c) {
      c = new Coin(this.add.image(0, 0, imageKey(this, 'coin')));
      this.coins.push(c);
    }
    c.drop(x, y);
  }

  private collectCoin(c: Coin): void {
    c.release();
    this.run.coins += this.b.drops.coinValue;
    this.st.coinsFromDrops += this.b.drops.coinValue;
  }

  private updateCoins(dt: number): void {
    const p = this.player;
    const d = this.b.drops;
    for (const c of this.coins) {
      if (c.active && c.update(dt, p.x, p.y, p.radius, d.magnetRadius, d.magnetSpeed)) this.collectCoin(c);
    }
  }

  // ---------- урон героине ----------

  private contactDamage(): void {
    const p = this.player;
    if (p.invul > 0) return;
    let hitBy: Target | null = null;
    const boss = this.boss;
    if (boss && boss.active && !boss.dying && Math.hypot(boss.x - p.x, boss.y - p.y) <= boss.radius + p.radius) hitBy = boss;
    if (!hitBy) {
      for (const e of this.enemies) {
        if (!e.active || e.dying) continue;
        const r = e.radius + p.radius;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy <= r * r) { hitBy = e; break; }
      }
    }
    if (!hitBy || ctx.debug.god) return;
    p.hp -= hitBy.damage * this.stats.armorFactor;
    p.invul = this.b.player.invulnerability;
    this.blood.hit(p.x, p.y, p.x - hitBy.x, p.y - hitBy.y);
    if (this.st.combo >= (this.b.chat.comboLostMin ?? 10)) this.chat.event('combo_lost', { combo: this.st.combo });
    this.st.combo = 0;
    this.noHitTimer = 0;
    if (this.st.task.type === 'noHit' && this.taskOpen()) this.st.task.progress = 0;
    this.cameras.main.shake(120, 0.004);
    this.chat.event('player_hit', { enemyId: hitBy.isBoss ? 'boss_hater' : (hitBy as Enemy).typeId });
    if (!this.lowHpWarned && p.hp > 0 && p.hp < this.stats.maxHp * this.b.player.lowHpRatio) {
      this.lowHpWarned = true;
      this.chat.event('low_hp');
    }
  }

  // ---------- завершение стрима ----------

  private beginSettle(): void {
    const st = this.st;
    const run = this.run;
    if (st.settled) return;
    st.settled = true;
    st.phase = 'settle';
    this.spawn.stop();
    for (const e of this.enemies) if (e.active && !e.dying) e.die();
    for (const pr of this.projectiles) if (pr.active) pr.release();
    for (const c of this.coins) if (c.active) this.collectCoin(c);
    const styleCoins = Math.floor(st.styleRaw * this.b.economy.styleToCoins);
    run.coins += styleCoins;
    run.totalStyle += st.styleRaw;
    run.totalKills += st.kills;
    if (!st.task.completed) this.chat.event('task_failed');
    this.chat.event('stream_end', { n: run.stream });
    this.time.delayedCall(1000, () => this.showSummary(styleCoins));
  }

  private showSummary(styleCoins: number): void {
    const st = this.st;
    st.phase = 'summary';
    const taskCoins = st.task.rewardPaid ? st.task.reward : 0;
    const total = st.coinsFromDrops + taskCoins + styleCoins;
    const secs = Math.round(st.elapsed);
    const rows: [string, string][] = [
      ['Стиль за стрим', String(st.styleRaw)],
      ['Убийств', String(st.kills)],
      ['Монеты с дропа', `+${st.coinsFromDrops}`],
      [`Задание: ${st.task.completed ? 'выполнено' : 'не выполнено'}`, `+${taskCoins}`],
      ['Монеты за стиль', `+${styleCoins}`],
      ['Итого монет', `+${total}`],
      ['Длительность стрима', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`],
    ];
    const fix = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(300000);
      this.overlay.push(o);
      return o;
    };
    fix(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.55));
    fix(panel(this, 560, 200, 800, 680, 0.92));
    fix(text(this, 960, 250, `Стрим ${this.run.stream} завершён`, 48, '#ff4f8b', { fontStyle: 'bold' }).setOrigin(0.5));
    let y = 330;
    for (const [l, v] of rows) {
      const bold = l === 'Итого монет';
      fix(text(this, 620, y, l, 28, bold ? '#ffd23f' : '#d6d3e3', bold ? { fontStyle: 'bold' } : {}));
      fix(text(this, 1300, y, v, 28, bold ? '#ffd23f' : '#ffffff', { fontStyle: 'bold' }).setOrigin(1, 0));
      y += 58;
    }
    const last = this.run.stream >= STREAMS;
    fix(button(this, 960, 810, 360, 76, last ? 'К вертолёту' : 'Дальше', () => this.next()));
  }

  private next(): void {
    if (this.leaving) return;
    this.leaving = true;
    const run = this.run;
    const finished = run.stream;
    run.stream++;
    run.current = null;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(finished >= STREAMS ? 'Final' : 'Day');
    });
  }

  private onDeath(): void {
    this.ended = true;
    this.chat.cancelPending();
    this.chat.event('death');
    this.player.setVisible(false);
    this.blood.kill(this.player.x, this.player.y, 0, 1, 2.5);
    this.cameras.main.shake(400, 0.01);
    this.time.delayedCall(1200, () => {
      this.cameras.main.fadeOut(300);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Result'));
    });
  }

  private debugFinish(): void {
    const st = this.st;
    st.styleRaw = Math.max(st.styleRaw, threshold(this.b, this.run.stream));
    st.thresholdReached = true;
    if (st.isBossStream && this.boss && !st.bossDead) {
      st.bossDead = true;
      this.boss.die();
    }
  }

  // ---------- пауза ----------

  private togglePause(): void {
    if (this.paused) {
      this.paused = false;
      this.clearOverlay();
      this.tweens.resumeAll();
      this.time.paused = false;
      return;
    }
    this.paused = true;
    this.tweens.pauseAll();
    this.time.paused = true;
    const fix = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(300000);
      this.overlay.push(o);
      return o;
    };
    fix(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.6));
    fix(text(this, 960, 380, 'Пауза', 64, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    fix(button(this, 960, 520, 380, 76, 'Продолжить', () => this.togglePause()));
    fix(button(this, 960, 620, 380, 64, 'В меню', () => {
      ctx.run = null;
      this.time.paused = false;
      this.tweens.resumeAll();
      this.scene.start('Select');
    }, { color: 0x4a4560, size: 26 }));
  }

  /** Esc на итогах стрима: выйти в главное меню (как в дне). */
  private toggleExitMenu(): void {
    if (this.exitMenu.length > 0) {
      for (const o of this.exitMenu) o.destroy();
      this.exitMenu = [];
      return;
    }
    if (this.leaving) return;
    const fix = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(400000);
      this.exitMenu.push(o);
      return o;
    };
    fix(this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.65).setInteractive());
    fix(panel(this, 610, 330, 700, 420, 0.95));
    fix(text(this, 960, 400, 'Выйти в меню?', 48, '#ffffff', { fontStyle: 'bold' }).setOrigin(0.5));
    fix(text(this, 960, 465, 'Забег будет потерян', 26, '#b9b5c9').setOrigin(0.5));
    fix(button(this, 960, 560, 380, 76, 'Продолжить', () => this.toggleExitMenu()));
    fix(button(this, 960, 660, 380, 64, 'В меню', () => {
      this.leaving = true;
      ctx.run = null;
      this.scene.start('Select');
    }, { color: 0x4a4560, size: 26 }));
  }

  // ---------- HUD и эффекты ----------

  private chatState(): ChatState {
    const st = this.st;
    const boss = this.boss;
    const hype = hypeRank(this.b, st.combo);
    return {
      heroineId: this.run.heroineId,
      cleared: this.cleared,
      stream: this.run.stream,
      isBossStream: st.isBossStream,
      bossAlive: !!boss && boss.active && !boss.dying,
      hpRatio: this.player.hp / this.stats.maxHp,
      combo: st.combo,
      rank: hype.rank,
      rankIndex: hype.index,
      viewers: viewers(this.b, this.run),
      kills: st.kills,
      task: st.task,
      donor: this.donor,
    };
  }

  private updateHud(): void {
    const st = this.st;
    const boss = this.boss;
    const hype = hypeRank(this.b, st.combo);
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.stats.maxHp,
      coins: this.run.coins,
      combo: st.combo,
      hypeRank: hype.rank,
      hypeIndex: hype.index,
      stream: this.run.stream,
      streams: STREAMS,
      nick: this.b.heroines[this.run.heroineId].nick,
      style: st.styleRaw,
      threshold: threshold(this.b, this.run.stream),
      viewers: viewers(this.b, this.run),
      task: st.task,
      bossHp: boss && boss.active && !boss.dying ? boss.hp : null,
      bossMaxHp: boss ? boss.maxHp : this.b.boss.hp,
      bossName: this.b.boss.name,
      thresholdReached: st.thresholdReached,
      isBossStream: st.isBossStream,
      pushCd: this.player.pushCd,
      pushMax: this.b.abilities.push.cooldown,
      dashCd: this.player.dashCd,
      dashMax: this.b.abilities.dash.cooldown,
      manual: this.manual,
    });
    this.updateBossArrow();
    if (st.phase === 'fight') {
      const m = takeViewersMilestone(this.b, viewers(this.b, this.run));
      if (m !== null) this.chat.event('viewers_milestone', { viewers: m });
    }
    if (ctx.debug.enabled) {
      this.hud.debugText.setText(
        `FPS ${Math.round(this.game.loop.actualFps)} · врагов ${this.aliveCount()} · ${Math.round(st.elapsed)} с · F9 — завершить стрим`,
      );
    }
  }
}
