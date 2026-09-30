import Phaser from 'phaser';

// Кровь: направленные брызги (частицы) и пятна на полу (декали), по референсу references/refcaht.png.
// Текстуры рисуются кодом. Числа ниже — визуальные, на баланс не влияют.
const CFG = {
  maxDecals: 260,        // пятен на арене одновременно; старые переиспользуются
  decalLife: 25,         // секунд до начала угасания пятна
  decalFade: 5,          // секунд угасания
  decalAlpha: 0.9,
  dropDecalChance: 0.35, // доля упавших капель, оставляющих след на полу
  hitDrops: 5,           // капель за попадание
  killDrops: 26,         // капель за убийство (× размер врага)
  spread: 55,            // полуугол конуса брызг, градусы
};

const SPLAT = 128;       // размер кадра пятна
const SPLAT_FRAMES = 6;
const DROP_RADII = [1.6, 2.2, 3, 4, 5.5];
const COLORS = { base: '#7c0a16', dark: '#4a050c', light: '#a3121f' };
const DROP_DECAL_TINT = 0x8a8a8a;

interface Decal { img: Phaser.GameObjects.Image; age: number }

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function makeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('fx:drops')) {
    const w = DROP_RADII.reduce((s, r) => s + Math.ceil(r * 2) + 4, 0);
    const tex = scene.textures.createCanvas('fx:drops', w, 16)!;
    const c = tex.getContext();
    let x = 0;
    DROP_RADII.forEach((r, i) => {
      const d = Math.ceil(r * 2) + 4;
      const cx = x + d / 2;
      c.fillStyle = COLORS.base;
      c.beginPath(); c.arc(cx, 8, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = COLORS.light;
      c.beginPath(); c.arc(cx - r * 0.3, 8 - r * 0.3, r * 0.45, 0, Math.PI * 2); c.fill();
      tex.add(`d${i}`, 0, x, 0, d, 16);
      x += d;
    });
    tex.refresh();
  }
  if (!scene.textures.exists('fx:splats')) {
    const tex = scene.textures.createCanvas('fx:splats', SPLAT * SPLAT_FRAMES, SPLAT)!;
    const c = tex.getContext();
    for (let f = 0; f < SPLAT_FRAMES; f++) {
      const ox = f * SPLAT + SPLAT / 2;
      const oy = SPLAT / 2;
      // Основное пятно: несколько перекрывающихся кругов неправильной формы.
      const blobs = 7 + Math.floor(Math.random() * 7);
      for (let i = 0; i < blobs; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = rnd(0, 14);
        const r = rnd(8, 20);
        const g = c.createRadialGradient(ox + Math.cos(a) * d, oy + Math.sin(a) * d, r * 0.2, ox + Math.cos(a) * d, oy + Math.sin(a) * d, r);
        g.addColorStop(0, COLORS.dark);
        g.addColorStop(0.7, COLORS.base);
        g.addColorStop(1, 'rgba(124,10,22,0.85)');
        c.fillStyle = g;
        c.beginPath(); c.arc(ox + Math.cos(a) * d, oy + Math.sin(a) * d, r, 0, Math.PI * 2); c.fill();
      }
      // Брызги-лучи и капли-спутники вокруг.
      const rays = 8 + Math.floor(Math.random() * 10);
      for (let i = 0; i < rays; i++) {
        const a = Math.random() * Math.PI * 2;
        const d0 = rnd(14, 24);
        const d1 = rnd(28, SPLAT / 2 - 6);
        const r = rnd(1.2, 4.2);
        c.strokeStyle = COLORS.base;
        c.lineWidth = r * 1.1;
        c.lineCap = 'round';
        if (Math.random() < 0.55) {
          c.beginPath();
          c.moveTo(ox + Math.cos(a) * d0, oy + Math.sin(a) * d0);
          c.lineTo(ox + Math.cos(a) * (d1 - r), oy + Math.sin(a) * (d1 - r));
          c.stroke();
        }
        c.fillStyle = Math.random() < 0.5 ? COLORS.base : COLORS.dark;
        c.beginPath(); c.arc(ox + Math.cos(a) * d1, oy + Math.sin(a) * d1, r, 0, Math.PI * 2); c.fill();
      }
      tex.add(`s${f}`, 0, f * SPLAT, 0, SPLAT, SPLAT);
    }
    tex.refresh();
  }
}

export class Blood {
  private spray: Phaser.GameObjects.Particles.ParticleEmitter;
  private decals: Decal[] = [];
  private next = 0;

  constructor(private scene: Phaser.Scene, private floorDepth: number) {
    makeTextures(scene);
    this.spray = scene.add.particles(0, 0, 'fx:drops', {
      frame: DROP_RADII.map((_, i) => `d${i}`),
      speed: { min: 90, max: 460 },
      scale: { start: 1.1, end: 0.7 },
      alpha: { start: 1, end: 0.85 },
      lifespan: { min: 140, max: 420 },
      emitting: false,
    }).setDepth(90000);
    // Часть упавших капель оставляет след на полу.
    this.spray.onParticleDeath((p: Phaser.GameObjects.Particles.Particle) => {
      if (Math.random() < CFG.dropDecalChance) this.decal(p.x, p.y, rnd(0.5, 1.0), 'fx:drops', `d${Math.floor(Math.random() * DROP_RADII.length)}`);
    });
  }

  private decal(x: number, y: number, scale: number, texture = 'fx:splats', frame?: string): void {
    let d = this.decals.length < CFG.maxDecals ? undefined : this.decals[this.next];
    if (!d) {
      d = { img: this.scene.add.image(0, 0, texture), age: 0 };
      this.decals.push(d);
    } else {
      this.next = (this.next + 1) % CFG.maxDecals;
    }
    d.age = 0;
    d.img.setTexture(texture, frame ?? `s${Math.floor(Math.random() * SPLAT_FRAMES)}`)
      .setPosition(x, y).setRotation(Math.random() * Math.PI * 2).setScale(scale)
      .setAlpha(CFG.decalAlpha).setDepth(this.floorDepth).setVisible(true);
    // Упавшие капли темнее летящих — подсохшая кровь на полу.
    if (texture === 'fx:drops') d.img.setTint(DROP_DECAL_TINT); else d.img.clearTint();
  }

  private burst(x: number, y: number, count: number, dirX: number, dirY: number, spread: number): void {
    const a = Phaser.Math.RadToDeg(Math.atan2(dirY, dirX));
    this.spray.setEmitterAngle({ min: a - spread, max: a + spread });
    this.spray.explode(count, x, y);
  }

  /** Попадание: небольшая струйка по направлению выстрела. */
  hit(x: number, y: number, dirX: number, dirY: number): void {
    this.burst(x, y, CFG.hitDrops, dirX, dirY, CFG.spread * 0.6);
  }

  /** Убийство: брызги по направлению выстрела и во все стороны, пятно на полу. size — множитель размера врага. */
  kill(x: number, y: number, dirX: number, dirY: number, size = 1): void {
    const n = Math.round(CFG.killDrops * size);
    this.burst(x, y, n, dirX, dirY, CFG.spread);
    this.burst(x, y, Math.round(n * 0.4), dirX, dirY, 180);
    this.decal(x + dirX * 10 * size, y + dirY * 10 * size, rnd(0.55, 0.85) * size);
    if (size > 1.5) {
      for (let i = 0; i < Math.round(size); i++) {
        this.decal(x + rnd(-30, 30) * size, y + rnd(-30, 30) * size, rnd(0.4, 0.8) * size);
      }
    }
  }

  update(dt: number): void {
    const life = CFG.decalLife;
    for (const d of this.decals) {
      if (!d.img.visible) continue;
      d.age += dt;
      if (d.age > life) {
        const k = 1 - (d.age - life) / CFG.decalFade;
        if (k <= 0) d.img.setVisible(false);
        else d.img.setAlpha(CFG.decalAlpha * k);
      }
    }
  }
}
