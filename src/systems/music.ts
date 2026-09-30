import Phaser from 'phaser';
import { ctx } from './context';
import { onSettingsChange, settings } from './settings';

// Фоновая музыка: один трек по кругу через все сцены (assets.json → music). Нет файла — тишина.

export const MUSIC_KEY = 'music:main';

type Track = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;
let track: Track | null = null;

const volume = (): number => (ctx.assets.music?.volume ?? 1) * settings.music;

export const hasMusic = (): boolean => track !== null;

export function startMusic(scene: Phaser.Scene): void {
  if (track || !ctx.assets.music?.path || !scene.cache.audio.exists(MUSIC_KEY)) return;
  const t = scene.sound.add(MUSIC_KEY, { loop: true, volume: volume() }) as Track;
  track = t;
  t.play();
  onSettingsChange(() => track?.setVolume(volume()));
}
