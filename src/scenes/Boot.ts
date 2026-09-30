import Phaser from 'phaser';
import { ctx } from '../systems/context';
import { parseDebug } from '../systems/debug';
import { createAnims, queueAssets, validateAssets } from '../systems/assets';
import { createRun } from '../systems/run';
import { enterRun, initMusic, playMenuMusic } from '../systems/music';
import { initSettingsUi } from '../ui/settings';
import type { AssetsConfig, Balance, ChatConfig } from '../types';
import { text } from '../ui/widgets';

// Загрузка конфигов (относительные пути) и затем ассетов из assets.json.
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    const label = text(this, 960, 540, 'Загрузка…', 36, '#ffffff').setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (v: number) => label.setText(`Загрузка… ${Math.round(v * 100)}%`));
    this.load.json('balance', 'config/balance.json');
    this.load.json('chat', 'config/chat.json');
    this.load.json('assets', 'config/assets.json');
  }

  create(): void {
    ctx.balance = this.cache.json.get('balance') as Balance;
    ctx.chat = (this.cache.json.get('chat') as ChatConfig) ?? { nicks: [], messages: {} };
    ctx.assets = (this.cache.json.get('assets') as AssetsConfig) ?? { portraits: {} as AssetsConfig['portraits'], sprites: {}, images: {} };
    ctx.debug = parseDebug(window.location.search);
    if (!ctx.balance) {
      text(this, 960, 540, 'Не удалось загрузить config/balance.json', 36, '#ff5a7a').setOrigin(0.5);
      return;
    }
    validateAssets(ctx.assets);
    queueAssets(this, ctx.assets);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.onAssetsLoaded());
    this.load.start();
  }

  private onAssetsLoaded(): void {
    createAnims(this, ctx.assets);
    initMusic(this.game);
    initSettingsUi(this.game);
    const d = ctx.debug;
    if (d.heroine) {
      ctx.run = createRun(ctx.balance, d.heroine, d.stream ?? 1, d.coins ?? 0);
      enterRun();
      this.scene.start('Night');
    } else {
      playMenuMusic();
      this.scene.start('Select');
    }
  }
}
