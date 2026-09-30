import Phaser from 'phaser';
import type { AssetsConfig, BobSpec, PlaceholderSpec, SpriteSpec } from '../types';
import { HEROINE_IDS } from '../types';
import { ctx } from './context';
import { MUSIC_KEY } from './music';

// Ассеты по ключам из assets.json (ТЗ, раздел 3). Нет файла → предупреждение и плейсхолдер.

export const portraitKey = (id: string, kind: 'base' | 'selected' | 'background') => `portrait:${id}:${kind}`;
export const spriteTexKey = (key: string) => `spr:${key}`;
export const imageTexKey = (key: string) => `img:${key}`;
export const soundKey = (key: string) => `snd:${key}`;
const placeholderKey = (key: string) => `ph:${key}`;
const animKey = (sprite: string, anim: string) => `${sprite}:${anim}`;

const REQUIRED_SPRITES = [
  'hero_genki', 'hero_kuudere', 'hero_yandere', 'enemy_walker', 'enemy_runner', 'enemy_brute',
  'boss_hater', 'weapon_rifle', 'weapon_laser', 'weapon_shotgun',
];
const REQUIRED_IMAGES = [
  'arena_bg', 'select_bg', 'coin', 'spawn_marker', 'boss_arrow', 'helicopter',
  'projectile_rifle', 'projectile_laser', 'projectile_shotgun',
];

export function validateAssets(a: AssetsConfig): void {
  for (const id of HEROINE_IDS) {
    const p = a.portraits?.[id];
    if (!p) { console.warn(`[assets] нет portraits.${id}`); continue; }
    for (const k of ['base', 'selected', 'background'] as const) {
      if (!(k in p)) console.warn(`[assets] нет portraits.${id}.${k}`);
    }
  }
  for (const k of REQUIRED_SPRITES) if (!a.sprites?.[k]) console.warn(`[assets] нет sprites.${k}`);
  for (const [k, spec] of Object.entries(a.sprites ?? {})) {
    for (const v of spec.variants ?? []) if (!a.sprites[v]) console.warn(`[assets] sprites.${k}.variants: нет sprites.${v}`);
  }
  for (const k of REQUIRED_IMAGES) if (!(k in (a.images ?? {}))) console.warn(`[assets] нет images.${k}`);
  for (const [k, spec] of Object.entries(a.sounds ?? {})) {
    for (const part of spec.sequence ?? []) if (!a.sounds?.[part]) console.warn(`[assets] sounds.${k}.sequence: нет sounds.${part}`);
  }
  (a.arena?.props ?? []).forEach((p, i) => {
    if (!p.img && !p.frames?.length) console.warn(`[assets] arena.props[${i}]: нет img или frames`);
    if (typeof p.x !== 'number' || typeof p.y !== 'number') console.warn(`[assets] arena.props[${i}]: x и y должны быть числами`);
  });
}

/** Ключ текстуры картинки окружения арены по её пути. */
export const envKey = (path: string): string => `env:${path}`;

export function queueAssets(scene: Phaser.Scene, a: AssetsConfig): void {
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
    console.warn(`[assets] не удалось загрузить ${file.key} (${String(file.url)}), используется плейсхолдер`);
  });
  for (const id of HEROINE_IDS) {
    const p = a.portraits?.[id];
    if (!p) continue;
    for (const kind of ['base', 'selected', 'background'] as const) {
      const path = p[kind];
      if (path) scene.load.image(portraitKey(id, kind), path);
      else console.warn(`[assets] portraits.${id}.${kind} = null, используется плейсхолдер`);
    }
  }
  for (const [key, spec] of Object.entries(a.sprites ?? {})) {
    if (spec.sheet) {
      scene.load.spritesheet(spriteTexKey(key), spec.sheet, {
        frameWidth: spec.frameWidth ?? 64,
        frameHeight: spec.frameHeight ?? spec.frameWidth ?? 64,
      });
    } else if (spec.image) {
      scene.load.image(spriteTexKey(key), spec.image);
    }
  }
  for (const [key, path] of Object.entries(a.images ?? {})) {
    if (path) scene.load.image(imageTexKey(key), path);
  }
  for (const [key, spec] of Object.entries(a.sounds ?? {})) {
    if (spec.path) scene.load.audio(soundKey(key), spec.path);
  }
  if (a.music?.path) scene.load.audio(MUSIC_KEY, a.music.path);
  const envPaths = new Set((a.arena?.props ?? []).flatMap((p) => p.frames ?? (p.img ? [p.img] : [])));
  for (const path of envPaths) scene.load.image(envKey(path), path);
}

// Создаёт анимации Phaser для загруженных спрайт-листов.
export function createAnims(scene: Phaser.Scene, a: AssetsConfig): void {
  for (const [key, spec] of Object.entries(a.sprites ?? {})) {
    const tex = spriteTexKey(key);
    if (!spec.sheet || !scene.textures.exists(tex)) continue;
    const total = scene.textures.get(tex).frameTotal - 1; // без __BASE
    for (const [name, anim] of Object.entries(spec.anims ?? {})) {
      const frames = anim.frames.filter((f) => f >= 0 && f < total);
      if (frames.length === 0) {
        console.warn(`[assets] ${key}.${name}: кадры вне листа, анимация пропущена`);
        continue;
      }
      const k = animKey(key, name);
      if (scene.anims.exists(k)) continue;
      scene.anims.create({
        key: k,
        frames: scene.anims.generateFrameNumbers(tex, { frames }),
        frameRate: anim.fps,
        repeat: name === 'death' ? 0 : -1,
      });
    }
  }
}

function hexToNum(color: string): number {
  return Phaser.Display.Color.HexStringToColor(color).color;
}

export function colorNum(color: string): number {
  return hexToNum(color);
}

function makePlaceholder(scene: Phaser.Scene, texKey: string, spec: PlaceholderSpec): void {
  if (scene.textures.exists(texKey)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = hexToNum(spec.color);
  const dark = Phaser.Display.Color.IntegerToColor(c).darken(35).color;
  if (spec.shape === 'circle') {
    g.fillStyle(c, 1).fillEllipse(spec.w / 2, spec.h / 2, spec.w, spec.h);
    g.lineStyle(2, dark, 1).strokeEllipse(spec.w / 2, spec.h / 2, spec.w - 2, spec.h - 2);
  } else {
    g.fillStyle(c, 1).fillRect(0, 0, spec.w, spec.h);
    if (spec.w >= 16 && spec.h >= 16) g.lineStyle(3, dark, 1).strokeRect(1.5, 1.5, spec.w - 3, spec.h - 3);
  }
  g.generateTexture(texKey, spec.w, spec.h);
  g.destroy();
}

// Встроенные плейсхолдеры для images.* (ТЗ, 3.3).
function makeImagePlaceholder(scene: Phaser.Scene, name: string): string {
  const key = placeholderKey(`img:${name}`);
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  let w = 32;
  let h = 32;
  switch (name) {
    case 'coin':
      w = h = 18;
      g.fillStyle(0xffd23f, 1).fillCircle(9, 9, 9);
      g.lineStyle(2, 0xb8860b, 1).strokeCircle(9, 9, 7.5);
      break;
    case 'spawn_marker':
      w = h = 32;
      g.lineStyle(6, 0xff2a2a, 1);
      g.lineBetween(4, 4, 28, 28).lineBetween(28, 4, 4, 28);
      break;
    case 'boss_arrow':
      w = h = 40;
      g.fillStyle(0xff3355, 1).fillTriangle(40, 20, 4, 4, 4, 36);
      g.lineStyle(3, 0xffffff, 1).strokeTriangle(40, 20, 4, 4, 4, 36);
      break;
    case 'helicopter':
      w = 320; h = 120;
      g.fillStyle(0x4b5563, 1).fillRoundedRect(40, 40, 200, 70, 24);
      g.fillStyle(0x374151, 1).fillRect(230, 60, 90, 16);
      g.fillStyle(0x93c5fd, 1).fillRoundedRect(60, 50, 60, 36, 10);
      g.fillStyle(0x111827, 1).fillRect(10, 20, 260, 8).fillRect(135, 20, 10, 24);
      break;
    case 'projectile_rifle':
      w = 16; h = 4;
      g.fillStyle(0xfff3b0, 1).fillRect(0, 0, 16, 4);
      break;
    case 'projectile_laser':
      w = 120; h = 10;
      g.fillStyle(0x7fe7ff, 0.35).fillRect(0, 0, 120, 10);
      g.fillStyle(0xe0faff, 1).fillRect(0, 3, 120, 4);
      break;
    case 'projectile_shotgun':
      w = 10; h = 5;
      g.fillStyle(0xffa94d, 1).fillRect(0, 0, 10, 5);
      break;
    case 'arena_bg':
      w = h = 80;
      g.fillStyle(0x15151c, 1).fillRect(0, 0, 80, 80);
      g.lineStyle(1, 0x24242f, 1).strokeRect(0, 0, 80, 80);
      break;
    default:
      g.fillStyle(0xff00ff, 1).fillRect(0, 0, w, h);
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

// Ключ текстуры для images.<name>: загруженная картинка или плейсхолдер.
export function imageKey(scene: Phaser.Scene, name: string): string {
  const k = imageTexKey(name);
  return scene.textures.exists(k) ? k : makeImagePlaceholder(scene, name);
}

export function hasImage(scene: Phaser.Scene, name: string): boolean {
  return scene.textures.exists(imageTexKey(name));
}

export function spriteSpec(key: string): SpriteSpec {
  return ctx.assets.sprites?.[key] ?? {};
}

export type Dir4 = 'down' | 'up' | 'left' | 'right';
export type Dir8 = Dir4 | 'down_left' | 'down_right' | 'up_left' | 'up_right';

export function dir8(dx: number, dy: number): Dir8 {
  const a = Math.atan2(dy, dx); // 0 = вправо, по часовой (ось Y вниз)
  const i = Math.round(a / (Math.PI / 4));
  const map: Record<string, Dir8> = {
    '0': 'right', '1': 'down_right', '2': 'down', '3': 'down_left', '4': 'left',
    '-4': 'left', '-3': 'up_left', '-2': 'up', '-1': 'up_right',
  };
  return map[String(i)] ?? 'down';
}

// Героини: 4 направления, на диагонали — горизонтальное.
export function dir4(dx: number, dy: number): Dir4 {
  if (dx !== 0) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'up' : 'down';
}

const DEFAULT_BOB: BobSpec = { amp: 5, freq: 14, squash: 0.06 };

/** Ключ спрайта с учётом вариантов: `variants` → случайный из списка. index — номер варианта с 1 (1, если вариантов нет). */
export function resolveVariant(spriteKey: string): { key: string; index: number } {
  const v = spriteSpec(spriteKey).variants;
  if (!v || v.length === 0) return { key: spriteKey, index: 1 };
  const i = Math.floor(Math.random() * v.length);
  return { key: v[i], index: i + 1 };
}

/**
 * Спрайт с единым интерфейсом для листа, картинки и плейсхолдера (ТЗ, 3.1).
 * Цепочка отката: анимация → зеркальная пара → idle_<dir> → idle_down → кадр 0 → плейсхолдер.
 * Шаг при ходьбе изображается кодом: подпрыгивание и лёгкое сжатие (`bob`).
 */
export class SpriteView extends Phaser.GameObjects.Sprite {
  readonly spriteKey: string;
  readonly spec: SpriteSpec;
  readonly isPlaceholder: boolean;
  private current = '';
  private baseScale = 1;
  private phase = Math.random() * Math.PI * 2;
  private walk = 0;       // 0…1, плавный переход между стоянием и ходьбой
  private idleT = Math.random() * 10;
  /** Текущее смещение по Y от покачивания (для точки крепления оружия). */
  bobOffset = 0;
  /** Номер варианта внешности с 1 (для реплик чата про конкретный вид врага). */
  readonly variant: number;

  constructor(scene: Phaser.Scene, x: number, y: number, key: string, fallback: PlaceholderSpec) {
    const { key: spriteKey, index: variant } = resolveVariant(key);
    const spec = spriteSpec(spriteKey);
    const tex = spriteTexKey(spriteKey);
    const loaded = scene.textures.exists(tex);
    let texture = tex;
    if (!loaded) {
      texture = placeholderKey(spriteKey);
      makePlaceholder(scene, texture, spec.placeholder ?? fallback);
    }
    super(scene, x, y, texture, loaded && spec.sheet ? 0 : undefined);
    this.spriteKey = spriteKey;
    this.variant = variant;
    this.spec = spec;
    this.isPlaceholder = !loaded;
    if (loaded) {
      const o = spec.origin ?? [0.5, 0.5];
      this.setOrigin(o[0], o[1]);
      this.baseScale = spec.scale ?? 1;
      this.setScale(this.baseScale);
    } else {
      this.setOrigin(0.5, 0.5);
    }
    scene.add.existing(this);
  }

  get weaponAnchor(): [number, number] {
    return this.spec.weaponAnchor ?? [0, 0];
  }

  /** Ставит спрайт в точку с покачиванием: при ходьбе — шаги, на месте — лёгкое дыхание. */
  place(x: number, y: number, moving: boolean, dt: number): void {
    if (this.isPlaceholder) {
      this.bobOffset = 0;
      this.setPosition(x, y);
      return;
    }
    const b = this.spec.bob ?? DEFAULT_BOB;
    this.walk += ((moving ? 1 : 0) - this.walk) * Math.min(1, dt * 10);
    if (moving) this.phase += dt * b.freq;
    this.idleT += dt;
    const step = Math.abs(Math.sin(this.phase));
    const breathe = (1 - this.walk) * 0.015 * Math.sin(this.idleT * 3);
    const squash = this.walk * b.squash * (1 - step);
    this.bobOffset = -step * b.amp * this.walk;
    this.setScale(this.baseScale * (1 + squash * 0.5), this.baseScale * (1 - squash + breathe));
    this.setPosition(x, y + this.bobOffset);
  }

  private has(name: string): boolean {
    return this.scene.anims.exists(animKey(this.spriteKey, name));
  }

  private resolveOne(name: string): { anim: string; flip: boolean } | null {
    if (this.has(name)) return { anim: name, flip: false };
    const m = this.spec.mirror?.[name];
    if (m && this.has(m)) return { anim: m, flip: true };
    return null;
  }

  /** Проигрывает анимацию по имени, например `move_down_left`, `death`. */
  playAnim(name: string): void {
    if (this.isPlaceholder || !this.spec.sheet) return;
    if (name === this.current) return;
    this.current = name;
    const dir = name.includes('_') ? name.slice(name.indexOf('_') + 1) : 'down';
    const r =
      this.resolveOne(name) ??
      this.resolveOne(`idle_${dir}`) ??
      this.resolveOne('idle_down');
    if (r) {
      this.setFlipX(r.flip);
      this.play(animKey(this.spriteKey, r.anim), true);
    } else {
      this.stop();
      this.setFlipX(false);
      this.setFrame(0);
    }
  }

  resetAnim(): void {
    this.current = '';
  }
}

// Статичная картинка из sprites.* (оружие) с плейсхолдером.
export function makeSpriteImage(scene: Phaser.Scene, spriteKey: string, fallback: PlaceholderSpec): Phaser.GameObjects.Image {
  const spec = spriteSpec(spriteKey);
  const tex = spriteTexKey(spriteKey);
  const loaded = scene.textures.exists(tex);
  let texture = tex;
  if (!loaded) {
    texture = placeholderKey(spriteKey);
    makePlaceholder(scene, texture, spec.placeholder ?? fallback);
  }
  const img = scene.add.image(0, 0, texture);
  const o = spec.origin ?? [0.5, 0.5];
  img.setOrigin(o[0], o[1]);
  img.setScale(loaded ? spec.scale ?? 1 : 1);
  return img;
}
