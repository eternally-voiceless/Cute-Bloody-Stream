import Phaser from 'phaser';
import { ctx } from './context';
import { onSettingsChange, settings } from './settings';

// Музыка (assets.json → music): трек меню по кругу и плейлист забега с паузами между треками.
// Не зависит от сцен: треки живут в общем звуковом менеджере игры, затухание — своим таймером.

export const musicKey = (path: string): string => `music:${path}`;

type Track = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

interface Playing { sound: Track; gain: number; target: number; speed: number; stopAtZero: boolean }

let game: Phaser.Game | null = null;
let mode: 'none' | 'menu' | 'run' = 'none';
let playing: Playing[] = [];
let runIndex = 0;
let runStarted = false;
let duck = 1;          // приглушение в магазине
let duckTarget = 1;
let nextTimer: number | null = null;
let ticker: number | null = null;

const cfg = () => ctx.assets.music ?? {};
const fadeTime = () => Math.max(0.05, cfg().fade ?? 1.2);
const loaded = (path: string | null | undefined): path is string => !!path && !!game?.cache.audio.exists(musicKey(path));

/** Все пути треков из конфига (для загрузки). */
export function musicPaths(): string[] {
  const c = cfg();
  return [...new Set([c.menu, ...(c.run ?? [])].filter((p): p is string => !!p))];
}

export const hasMusic = (): boolean => musicPaths().some(loaded);

function volumeOf(p: Playing): number {
  return (cfg().volume ?? 1) * settings.music * duck * p.gain;
}

function apply(): void {
  for (const p of playing) p.sound.setVolume(volumeOf(p));
}

// Плавные переходы: громкость каждого трека и приглушение ведём к цели 20 раз в секунду.
function tick(): void {
  const dt = 0.05;
  duck += Phaser.Math.Clamp(duckTarget - duck, -dt / 0.8, dt / 0.8);
  for (const p of playing) {
    p.gain += Phaser.Math.Clamp(p.target - p.gain, -p.speed * dt, p.speed * dt);
  }
  for (const p of playing.filter((q) => q.stopAtZero && q.gain <= 0)) {
    p.sound.stop();
    p.sound.destroy();
  }
  playing = playing.filter((q) => !(q.stopAtZero && q.gain <= 0));
  apply();
}

export function initMusic(g: Phaser.Game): void {
  game = g;
  if (ticker === null) ticker = window.setInterval(tick, 50);
  onSettingsChange(apply);
}

function fadeOutAll(): void {
  for (const p of playing) {
    p.target = 0;
    p.stopAtZero = true;
    p.speed = 1 / fadeTime();
  }
}

function play(path: string, loop: boolean, fadeIn: boolean, onEnd?: () => void): void {
  if (!game) return;
  const sound = game.sound.add(musicKey(path), { loop, volume: 0 }) as Track;
  const p: Playing = { sound, gain: fadeIn ? 0 : 1, target: 1, speed: 1 / fadeTime(), stopAtZero: false };
  playing.push(p);
  sound.setVolume(volumeOf(p));
  sound.once(Phaser.Sound.Events.COMPLETE, () => {
    playing = playing.filter((q) => q !== p);
    sound.destroy();
    onEnd?.();
  });
  sound.play();
}

function clearNext(): void {
  if (nextTimer !== null) window.clearTimeout(nextTimer);
  nextTimer = null;
}

/** Главное меню: трек меню по кругу. Забег (если шёл) плавно затухает. */
export function playMenuMusic(): void {
  duckTarget = 1;
  if (mode === 'menu') return;
  clearNext();
  fadeOutAll();
  mode = 'menu';
  runStarted = false;
  const path = cfg().menu;
  if (loaded(path)) play(path, true, true);
}

/** Начало забега: музыка меню плавно затихает в тишину. */
export function enterRun(): void {
  if (mode === 'run') return;
  clearNext();
  fadeOutAll();
  mode = 'run';
  runStarted = false;
  runIndex = 0;
}

/** Начало боя: на первом стриме забега плейлист стартует через `startDelay`. На следующих уже играет. */
export function startRunMusic(): void {
  if (mode !== 'run') enterRun();
  if (runStarted) return;
  runStarted = true;
  nextTimer = window.setTimeout(playNextRun, (cfg().startDelay ?? 1) * 1000);
}

function playNextRun(): void {
  nextTimer = null;
  if (mode !== 'run') return;
  const list = (cfg().run ?? []).filter(loaded);
  if (list.length === 0) return;
  const path = list[runIndex % list.length];
  runIndex++;
  // Трек доиграл — пауза `gap` — следующий.
  play(path, false, false, () => {
    if (mode === 'run') nextTimer = window.setTimeout(playNextRun, (cfg().gap ?? 2) * 1000);
  });
}

/** Магазин (день): музыка забега тише, но продолжает играть. */
export function setShopDuck(on: boolean): void {
  duckTarget = on ? cfg().shopVolume ?? 0.3 : 1;
}
