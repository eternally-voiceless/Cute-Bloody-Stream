import type { AssetsConfig, Balance, ChatConfig, RunState } from '../types';
import type { DebugOptions } from './debug';

// Общие данные для всех сцен: конфиги грузятся в Boot, RunState живёт в памяти (ТЗ, 10.1).
export interface GameContext {
  balance: Balance;
  chat: ChatConfig;
  assets: AssetsConfig;
  debug: DebugOptions;
  run: RunState | null;
}

export const ctx: GameContext = {
  balance: undefined as unknown as Balance,
  chat: undefined as unknown as ChatConfig,
  assets: undefined as unknown as AssetsConfig,
  debug: undefined as unknown as DebugOptions,
  run: null,
};
