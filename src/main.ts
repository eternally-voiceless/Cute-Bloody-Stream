import Phaser from 'phaser';
import { BootScene } from './scenes/Boot';
import { SelectScene } from './scenes/Select';
import { NightScene } from './scenes/Night';
import { DayScene } from './scenes/Day';
import { ResultScene } from './scenes/Result';
import { FinalScene } from './scenes/Final';
import { ctx } from './systems/context';

// Логическое разрешение 1920×1080, Scale.FIT по центру (ТЗ, раздел 2).
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#0b0b10',
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, SelectScene, NightScene, DayScene, ResultScene, FinalScene],
});

// Отладка: доступ к игре из консоли браузера при ?debug=1.
if (new URLSearchParams(window.location.search).get('debug') === '1') {
  (window as unknown as { cbs: unknown }).cbs = { game, ctx };
}
