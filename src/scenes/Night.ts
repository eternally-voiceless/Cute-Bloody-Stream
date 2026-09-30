import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { imageKey } from '../systems/assets';
import { createStream, threshold, viewers } from '../systems/run';
import { deriveStats, type DerivedStats } from '../systems/stats';
import { killFlags, killStyle, type KillFlags } from '../systems/style';
import { taskText } from '../systems/tasks';
import { SpawnSystem } from '../systems/spawn';
import { ChatSystem } from '../systems/chat';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
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
  private blood!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bossLine!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private paused = false;
  private ended = false;
  private volley = 0;
  private comboTimer = 0;
  private noHitTimer = 0;
  private lowHpWarned = false;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private introDom: Phaser.GameObjects.DOMElement | null = null;

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
    this.overlay = [];
    this.introDom = null;

    const b = this.b;
    this.st = this.run.current = createStream(b, this.run);
    this.stats = deriveStats(b, this.run.heroineId, this.run.statPoints);
    const a = b.world.arena;

    // Арена: тёмная заливка с сеткой (или arena_bg), стены.
    this.add.tileSprite(0, 0, a.width, a.height, imageKey(this, 'arena_bg')).setOrigin(0).setDepth(-1e6);
    this.add.graphics().lineStyle(8, 0xff3d7f, 0.6).strokeRect(0, 0, a.width, a.height).setDepth(-1e6 + 1);

    this.player = new Player(this, b, this.run.heroineId, this.stats, a.width / 2, a.height / 2);
    this.player.hp = this.stats.maxHp;   // intro: HP до максимума
    this.player.sync();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, a.width, a.height);
    cam.startFollow(this.player.view, true, b.world.camera.lerp, b.world.camera.lerp);
    cam.fadeIn(250);

    this.spawn = new SpawnSystem(this, b, this.run.stream);
    this.bossLine = this.add.graphics().setDepth(-400);
    this.numbers = new DamageNumbers(this);
    this.makeBlood();

    this.chatPanel = new ChatPanel(this, 1560, 140, 340, 760, b.chat.maxMessages);
    this.chat = new ChatSystem(this.chatPanel, ctx.chat, b, this.run.heroineId);
    this.hud = new Hud(this);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,ESC,F9') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (this.st.phase === 'intro' && e.code !== 'Escape') this.startFight();
    });
    this.input.on('pointerdown', () => { if (this.st.phase === 'intro') this.startFight(); });
    this.keys.ESC.on('down', () => { if (this.st.phase === 'fight' && !this.ended) this.togglePause(); });
    this.keys.F9.on('down', () => { if (ctx.debug.enabled && this.st.phase === 'fight') this.debugFinish(); });

    this.showIntro();
    this.chat.event('stream_start', { n: this.run.stream });
    this.time.delayedCall(600, () => this.chat.event('task_new'));
    this.updateHud();
  }

  // ---------- intro ----------

  private showIntro(): void {
    const t = this.st.task;
    const nick = ctx.chat.nicks[Math.floor(Math.random() * ctx.chat.nicks.length)] ?? 'viewer';
    const el = document.createElement('div');
    el.className = 'donation';
    el.innerHTML =
      `<div class="d-head">Стрим ${this.run.stream} / ${STREAMS}${this.st.isBossStream ? ' · БОСС' : ''}</div>` +
      `<div class="d-nick"></div><div class="d-amount">${t.reward} монет</div>` +
      `<div class="d-text"></div><div class="d-hint">Нажмите любую клавишу</div>`;
    (el.querySelector('.d-nick') as HTMLElement).textContent = `${nick} задонатил(а)`;
    (el.querySelector('.d-text') as HTMLElement).textContent = taskText(t);
    this.introDom = this.add.dom(960, 500, el).setOrigin(0.5).setScrollFactor(0).setDepth(2000);
    const dim = this.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.55).setScrollFactor(0).setDepth(150000);
    this.overlay.push(dim);
  }

  private startFight(): void {
    this.clearOverlay();
    this.introDom?.destroy();
    this.introDom = null;
    this.st.phase = 'fight';
    if (this.st.isBossStream) this.spawnBoss();
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
    // speed > 1 только в отладке: несколько шагов боя за кадр.
    for (let i = 0; i < ctx.debug.speed; i++) {
      if (this.st.phase === 'fight' && !this.ended) this.fightStep(dt);
      else this.idleStep(dt);
    }
    this.player.sync();
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
    p.move(dt, ix, iy);
    p.tick(dt);
    if (p.hp < this.stats.maxHp) p.hp = Math.min(this.stats.maxHp, p.hp + this.stats.regenPerSec * dt);
    if (this.lowHpWarned && p.hp >= this.stats.maxHp * b.player.lowHpRatio) this.lowHpWarned = false;

    let alive = 0;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.dying) { e.updateDying(dt); continue; }
      e.update(dt, p.x, p.y, p.radius, a.width, a.height);
      alive++;
    }
    this.separate();
    for (const e of this.enemies) if (e.active && !e.dying) e.sync();

    const boss = this.boss;
    if (boss && boss.active) {
      if (boss.dying) boss.updateDying(dt);
      else {
        if (boss.update(dt, p.x, p.y, p.radius)) alive += this.summon(alive);
        boss.sync();
      }
    }
    this.drawBossLine();

    for (const o of this.spawn.update(dt, alive, p.x, p.y)) this.spawnEnemy(o.type, o.x, o.y, false);

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
    this.boss = new Boss(this, b, pos.x, pos.y);
    this.boss.sync();
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
    return n;
  }

  private drawBossLine(): void {
    const g = this.bossLine;
    g.clear();
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
    const target = this.findTarget();
    if (!target) {
      p.fireTimer = Math.max(p.fireTimer, 0);
      return;
    }
    p.aimAt(target.x, target.y);
    if (p.fireTimer > 0) return;
    p.fireTimer = Math.max(p.fireTimer + period, 0);
    const m = p.muzzle;
    const base = Math.atan2(target.y - m.y, target.x - m.x);
    this.volley++;
    for (let i = 0; i < w.pellets; i++) {
      const spread = Phaser.Math.DegToRad(Phaser.Math.FloatBetween(-w.spread / 2, w.spread / 2));
      this.getProjectile().fire(m.x, m.y, base + spread, w.projectileSpeed, s.range, s.damage, w.pierce, this.volley);
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
    if (w.knockback > 0 && t.lastKnockVolley !== pr.volley && !t.isBoss) {
      t.lastKnockVolley = pr.volley;
      (t as Enemy).knock(pr.dirX, pr.dirY, w.knockback);
    }
    if (t.hp <= 0) this.onKill(t, crit);
  }

  // ---------- убийства, стиль, задание ----------

  private taskOpen(): boolean {
    const st = this.st;
    return !st.task.completed && !(st.isBossStream && st.thresholdReached);
  }

  private onKill(t: Target, crit: boolean): void {
    const st = this.st;
    const p = this.player;
    const dist = Math.hypot(t.x - p.x, t.y - p.y);
    const flags = killFlags(this.b, { crit, dist, range: this.stats.range });
    this.blood.explode(t.isBoss ? 60 : 12, t.x, t.y);
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
    st.combo++;
    this.comboTimer = this.b.style.comboWindow;
    if (this.taskOpen()) this.advanceTask(flags);
    if (Math.random() * 100 < this.stats.dropChance) this.dropCoin(e.x, e.y);

    this.chat.event('kill');
    if (flags.crit) this.chat.event('crit');
    if (flags.longShot) this.chat.event('long_shot');
    if (flags.close) this.chat.event('close_kill');
    if (st.combo > 0 && st.combo % 10 === 0) this.chat.event('combo', { n: st.combo });
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
    this.checkTask();
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
    this.st.combo = 0;
    this.noHitTimer = 0;
    if (this.st.task.type === 'noHit' && this.taskOpen()) this.st.task.progress = 0;
    this.cameras.main.shake(120, 0.004);
    this.chat.event('player_hit');
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
    this.chat.event('death');
    this.player.setVisible(false);
    this.blood.explode(80, this.player.x, this.player.y);
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

  // ---------- HUD и эффекты ----------

  private makeBlood(): void {
    if (!this.textures.exists('fx:blood')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4);
      g.generateTexture('fx:blood', 8, 8);
      g.destroy();
    }
    this.blood = this.add.particles(0, 0, 'fx:blood', {
      speed: { min: 60, max: 260 },
      scale: { start: 1.2, end: 0.3 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 250, max: 600 },
      tint: [0xb3122e, 0x8a0b1f, 0xd81e3c],
      gravityY: 300,
      emitting: false,
    }).setDepth(90000);
  }

  private updateHud(): void {
    const st = this.st;
    const boss = this.boss;
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.stats.maxHp,
      coins: this.run.coins,
      combo: st.combo,
      stream: this.run.stream,
      streams: STREAMS,
      style: st.styleRaw,
      threshold: threshold(this.b, this.run.stream),
      viewers: viewers(this.b, this.run),
      task: st.task,
      bossHp: boss && boss.active && !boss.dying ? boss.hp : null,
      bossMaxHp: this.b.boss.hp,
      bossName: this.b.boss.name,
      thresholdReached: st.thresholdReached,
      isBossStream: st.isBossStream,
    });
    this.updateBossArrow();
    if (ctx.debug.enabled) {
      this.hud.debugText.setText(
        `FPS ${Math.round(this.game.loop.actualFps)} · врагов ${this.aliveCount()} · ${Math.round(st.elapsed)} с · F9 — завершить стрим`,
      );
    }
  }
}
