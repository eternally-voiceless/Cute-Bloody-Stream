import Phaser from 'phaser';
import type { SoundSpec } from '../types';
import { soundKey } from './assets';
import { ctx } from './context';
import { settings } from './settings';

// Звуки по ключам из assets.json → sounds. Нет записи или файла — тишина, игра продолжается.

const playing = new Map<string, number>();        // сколько копий звука звучит сейчас
const chains = new Map<string, () => void>();      // ключ цепочки → оборвать её хвост

/** Для выстрелов: интервал между выстрелами (с) и во сколько раз скорострельность выше базовой. */
export interface FireInfo { period: number; speedup: number }

const FADE = 0.03; // затухание при обрезке хвоста, с

export function playSound(scene: Phaser.Scene, key: string, fire?: FireInfo): void {
  const spec = ctx.assets.sounds?.[key];
  if (!spec) return;
  if (spec.sequence) playSequence(scene, key, spec);
  else playOne(scene, key, spec, undefined, fire);
}

/** Играет один файл; onDone — после окончания (не вызывается, если звук оборван или не загружен). */
function playOne(scene: Phaser.Scene, key: string, spec: SoundSpec, onDone?: () => void, fire?: FireInfo): Phaser.Sound.BaseSound | null {
  const k = soundKey(key);
  if (!scene.cache.audio.exists(k) || settings.sfx <= 0) return null;
  const n = playing.get(key) ?? 0;
  if (spec.max && n >= spec.max) return null;
  const volume = (ctx.assets.soundVolume ?? 1) * (spec.volume ?? 1) * settings.sfx;
  const rate = fire && spec.rateScale
    ? Phaser.Math.Clamp(1 + spec.rateScale * (fire.speedup - 1), 1, spec.maxRate ?? 1.5)
    : 1;
  const snd = scene.sound.add(k, {
    volume,
    rate,
    detune: spec.detune ? Phaser.Math.Between(-spec.detune, spec.detune) : 0,
  });
  playing.set(key, n + 1);
  const release = () => {
    playing.set(key, Math.max(0, (playing.get(key) ?? 1) - 1));
    scene.tweens.killTweensOf(snd);
  };
  snd.once(Phaser.Sound.Events.COMPLETE, () => { release(); snd.destroy(); onDone?.(); });
  snd.once(Phaser.Sound.Events.STOP, () => { release(); snd.destroy(); });
  snd.play();
  // Хвост выстрела не длиннее интервала до следующего: иначе очередь сливается в сплошной шум.
  if (fire && spec.tailToPeriod) {
    const full = (snd as Phaser.Sound.WebAudioSound).duration / rate;
    const keep = Math.max(fire.period, FADE * 2);
    if (keep < full) {
      scene.time.delayedCall((keep - FADE) * 1000, () => {
        if (!snd.isPlaying) return;
        scene.tweens.add({ targets: snd, volume: 0, duration: FADE * 1000, onComplete: () => { if (snd.isPlaying) snd.stop(); } });
      });
    }
  }
  return snd;
}

/** Цепочка: каждая часть начинается сразу после окончания предыдущей. Первая часть не обрывается. */
function playSequence(scene: Phaser.Scene, key: string, spec: SoundSpec): void {
  if (spec.interrupt !== false) chains.get(key)?.();
  const parts = spec.sequence ?? [];
  let cancelled = false;
  let current: Phaser.Sound.BaseSound | null = null;
  let index = 0;
  const cancel = () => {
    cancelled = true;
    if (current && index > 0 && current.isPlaying) current.stop();
  };
  chains.set(key, cancel);
  const next = () => {
    if (cancelled || index >= parts.length) {
      if (chains.get(key) === cancel) chains.delete(key);
      return;
    }
    const part = parts[index];
    const partSpec = ctx.assets.sounds?.[part];
    current = partSpec ? playOne(scene, part, partSpec, () => { index++; next(); }) : null;
    if (!current) { index++; next(); }
  };
  next();
}
