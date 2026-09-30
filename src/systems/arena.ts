import Phaser from 'phaser';
import type { ArenaProp } from '../types';
import { ctx } from './context';
import { envKey, hasImage, imageKey } from './assets';

// Окружение арены (assets.json → arena): пол, затемнённая полоса за линией, декали, объекты и огонь.
// Объёмные объекты стоят за линией, поэтому коллизий нет. См. arena-plan/ARENA-LAYOUT-PLAN.md.

const FLOOR = -1e6;
const STRIP_DIM = FLOOR + 0.5;
const LINE = FLOOR + 1;
const DECAL = FLOOR + 1.5;
const GLOW = FLOOR + 2.5;       // над кровью (FLOOR + 2), под объектами
const BEHIND = FLOOR + 3;       // объекты у верхнего края — за спиной у всех
const CLEAR_CENTER = 400;       // радиус чистого центра арены для декалей
const GLOW_TEX = 'fx:glow';

const gray = (v: number): number => {
  const c = Phaser.Math.Clamp(Math.round(v * 255), 0, 255);
  return (c << 16) | (c << 8) | c;
};

const cfg = () => ctx.assets.arena ?? {};

/** Пол: тайл `images.arena_bg` с яркостью и масштабом из `arena`. Используется и на арене, и в финале. */
export function floorSprite(scene: Phaser.Scene, x: number, y: number, w: number, h: number): Phaser.GameObjects.TileSprite {
  const floor = scene.add.tileSprite(x, y, w, h, imageKey(scene, 'arena_bg')).setOrigin(0).setDepth(FLOOR);
  // Яркость и масштаб — только для настоящей картинки: заглушка-сетка и так тёмная.
  if (hasImage(scene, 'arena_bg')) {
    const s = cfg().floorScale ?? 1;
    floor.setTileScale(s, s).setTint(gray(cfg().floorBrightness ?? 1));
  }
  return floor;
}

/** Строит арену и возвращает ширину полосы за линией (для границ камеры). */
export function buildArena(scene: Phaser.Scene): number {
  const { width: W, height: H } = ctx.balance.world.arena;
  const c = cfg();
  const b = c.border ?? 0;
  const dim = c.dim ?? 1;
  const floorBright = hasImage(scene, 'arena_bg') ? c.floorBrightness ?? 1 : 1;

  floorSprite(scene, -b, -b, W + 2 * b, H + 2 * b);
  if (b > 0 && dim < 1) {
    // Затемнение полосы — ниже линии и актёров: голова героини и босса у края заходит в полосу.
    const a = 1 - dim;
    for (const [x, y, w, h] of [[-b, -b, W + 2 * b, b], [-b, H, W + 2 * b, b], [-b, 0, b, H], [W, 0, b, H]]) {
      scene.add.rectangle(x, y, w, h, 0x000000, a).setOrigin(0).setDepth(STRIP_DIM);
    }
  }
  scene.add.graphics().lineStyle(8, 0xff3d7f, 0.6).strokeRect(0, 0, W, H).setDepth(LINE);

  const props = c.props ?? [];
  const depths = new Map<number, { depth: number; x: number; y: number; h: number }>();
  const missing = (p: ArenaProp, i: number): boolean => {
    const keys = (p.frames ?? (p.img ? [p.img] : [])).map(envKey);
    const bad = keys.length === 0 || keys.some((k) => !scene.textures.exists(k));
    if (bad) console.warn(`[arena] props[${i}]: картинка не загружена, объект пропущен`);
    return bad;
  };

  // Сначала декали и объекты: огню нужна глубина объекта, на котором он лежит.
  props.forEach((p, i) => {
    if (p.frames || missing(p, i)) return;
    const img = scene.add.image(p.x, p.y, envKey(p.img!))
      .setScale(p.scale ?? 1).setAngle(p.angle ?? 0).setFlipX(!!p.flip).setAlpha(p.alpha ?? 1);
    const inside = p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
    if (p.flat) {
      // Декаль тонируется как пол под ней, иначе на затемнённом полу она станет светлее бетона.
      img.setDepth(DECAL).setTint(gray(floorBright * (inside ? 1 : dim)));
      if (Math.hypot(p.x - W / 2, p.y - H / 2) < CLEAR_CENTER) console.warn(`[arena] props[${i}]: декаль ближе ${CLEAR_CENTER} px к центру арены`);
      return;
    }
    img.setOrigin(0.5, 1).setTint(gray(dim));
    const depth = p.y <= 0 ? BEHIND : p.y;
    img.setDepth(depth);
    depths.set(i, { depth, x: p.x, y: p.y, h: img.displayHeight });
    // Рамка объекта не должна заходить за линию: иначе героиня пройдёт сквозь него.
    const l = p.x - img.displayWidth / 2, r = p.x + img.displayWidth / 2, t = p.y - img.displayHeight;
    if (l < W && r > 0 && t < H && p.y > 0) {
      const into = Math.round(Math.min(r, W - l, p.y, H - t));
      console.warn(`[arena] props[${i}] заходит в поле на ${into} px`);
    }
  });

  props.forEach((p, i) => {
    if (!p.frames || missing(p, i)) return;
    let base = p.depthOf !== undefined ? depths.get(p.depthOf) : undefined;
    if (!base) {
      // Без depthOf огонь ложится на ближайший объект; связь пишем в консоль, чтобы она была видна.
      let best = Infinity, on = -1;
      for (const [j, d] of depths) {
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist < best) { best = dist; base = d; on = j; }
      }
      if (on >= 0) console.info(`[arena] props[${i}]: огонь на props[${on}]`);
    }
    addFire(scene, p, base?.depth ?? BEHIND);
  });

  return b;
}

function addFire(scene: Phaser.Scene, p: ArenaProp, baseDepth: number): void {
  const frames = p.frames!;
  const anim = `env:fire:${frames.join('|')}`;
  // Night перезапускается каждый стрим: анимация и текстура света создаются один раз.
  if (!scene.anims.exists(anim)) {
    scene.anims.create({ key: anim, frames: frames.map((f) => ({ key: envKey(f) })), frameRate: 8, repeat: -1 });
  }
  makeGlowTexture(scene);

  const s = p.scale ?? 1;
  const fire = scene.add.sprite(p.x, p.y, envKey(frames[0])).setOrigin(0.5, 1).setScale(s)
    .setFlipX(!!p.flip).setAlpha(p.alpha ?? 1).setDepth(baseDepth + 0.1);
  fire.play({ key: anim, startFrame: Phaser.Math.Between(0, frames.length - 1) });
  scene.tweens.add({
    targets: fire, scaleX: s * 1.06, scaleY: s * 0.95, duration: Phaser.Math.Between(180, 260),
    yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });

  // Тёплый свет на полу вокруг огня.
  const glow = scene.add.image(p.x, p.y - fire.displayHeight * 0.3, GLOW_TEX)
    .setBlendMode(Phaser.BlendModes.ADD).setScale(1.6 * s).setAlpha(0.3).setDepth(GLOW);
  scene.tweens.add({
    targets: glow, alpha: { from: 0.24, to: 0.36 }, scale: { from: 1.55 * s, to: 1.7 * s },
    duration: Phaser.Math.Between(110, 170), yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });
}

function makeGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_TEX)) return;
  const R = 128;
  const tex = scene.textures.createCanvas(GLOW_TEX, R * 2, R * 2)!;
  const c = tex.getContext();
  const g = c.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, 'rgba(255, 150, 60, 1)');
  g.addColorStop(0.4, 'rgba(255, 110, 30, 0.45)');
  g.addColorStop(1, 'rgba(255, 80, 20, 0)');
  c.fillStyle = g;
  c.fillRect(0, 0, R * 2, R * 2);
  tex.refresh();
}
