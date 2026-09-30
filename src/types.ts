// Типы конфигов из public/config/*.json и состояния забега (ТЗ, разделы 3, 10, 11).

export type HeroineId = 'genki' | 'kuudere' | 'yandere';
export const HEROINE_IDS: HeroineId[] = ['genki', 'kuudere', 'yandere'];

export type StatId =
  | 'hp' | 'damage' | 'attackSpeed' | 'moveSpeed' | 'range'
  | 'armor' | 'regen' | 'crit' | 'resourceSearch';
export const STAT_IDS: StatId[] = [
  'hp', 'damage', 'attackSpeed', 'moveSpeed', 'range', 'armor', 'regen', 'crit', 'resourceSearch',
];

export type TaskType = 'kills' | 'crits' | 'longShots' | 'closeKills' | 'combo' | 'noHit';

export interface HeroineConfig {
  name: string;        // имя: Мива, Рэй, Зои
  nick: string;        // ник стримерши
  color: string;
  weapon: string;
  baseHp: number;
  baseMoveSpeed: number;
  stats: Record<StatId, number>;
  styleMultipliers: Partial<Record<'crit' | 'longShot' | 'close' | 'combo', number>>;
}

export interface WeaponConfig {
  name: string;
  damage: number;
  fireRate: number;
  range: number;
  spread: number;
  pellets: number;
  pierce: number;
  pierceDamageFactor: number;
  projectileSpeed: number;
  critChance: number;
  critMultiplier: number;
  knockback: number;
  magazine?: number;     // выстрелов до перезарядки; нет поля — без перезарядки
  reloadTime?: number;   // перезарядка, с
}

export interface EnemyConfig {
  name: string;
  hp: number;
  speed: number;
  damage: number;
  style: number;
  size: number;
  color: string;
  weight: number;
  fromStream: number;
  knockbackResist: number;
}

export interface BossConfig {
  name: string;
  streams: number[];
  hp: number;
  speed: number;
  damage: number;
  style: number;
  size: number;
  color: string;
  spawnOffset: number;
  dash: { cooldown: number; telegraph: number; speed: number; distance: number };
  summon: { cooldown: number; count: number };
}

export interface Linear { base: number; step: number }

export interface Balance {
  world: { arena: { width: number; height: number }; camera: { lerp: number }; separation: number };
  stats: { minFactor: number; maxFactor: number; armorK: number; regenAlpha: number };
  player: { invulnerability: number; size: number; lowHpRatio: number };
  heroines: Record<HeroineId, HeroineConfig>;
  weapons: Record<string, WeaponConfig>;
  enemies: Record<string, EnemyConfig>;
  boss: BossConfig;
  scaling: { hpPerStream: number; damagePerStream: number; bossHpPerStream?: number };
  spawn: {
    interval: number; intervalStep: number; minInterval: number;
    group: number; groupEvery: number; minDistance: number; telegraph: number; maxAlive: number;
  };
  style: {
    threshold: Linear;
    comboWindow: number; comboStep: number; comboCap: number;
    critBonus: number; longShotRatio: number; longShotBonus: number; closeDistance: number; closeBonus: number;
    hype: { rank: string; combo: number }[];
  };
  viewers: { base: number; perStyle: number };
  drops: { coinValue: number; magnetRadius: number; magnetSpeed: number };
  economy: { styleToCoins: number };
  tasks: {
    reward: Linear;
    expectedStylePerKill: Linear;
    byHeroine: Record<HeroineId, TaskType[]>;
    kills: { share: number };
    crits: { share: number; minCritChance: number };
    longShots: { share: number };
    closeKills: { share: number };
    combo: { base: number; step: number; max: number };
    noHit: { base: number; step: number; max: number };
  };
  shop: Record<StatId, { name: string; increment: number; basePrice: number; priceStep: number }>;
  chat: {
    baseInterval: number; minInterval: number; maxMessages: number;
    maxPerSecond: number; queueMax: number; categoryCooldown: number;
    eventChance: Record<string, number>;
    cooldowns?: Record<string, number>;
    rankUpChance?: Record<string, number>;
    recentTextMemory?: number;
    recentAuthorMemory?: number;
    regularShare?: number;
    mentionRecentShare?: number;
    reply?: { maxDepth: number; maxPending: number };
    burst?: Record<string, number>;
    burstGap?: [number, number];
    finalInterval?: number;
    taskNearRatio?: number;
    taskNearMinTarget?: number;
    lowHpOkRatio?: number;
    comboLostMin?: number;
    viewersMilestones?: number[];
  };
}

// chat.json v2 (chat-proposal/CHAT-LOGIC.md). Строка в messages = { text }.
export interface ChatEntryObj {
  text: string;
  weight?: number;
  once?: boolean;
  if?: Record<string, unknown>;
  by?: string;
  nick?: 'donor';
  reply?: string;
}
export type ChatEntry = string | ChatEntryObj;

export interface ChatReplyPool {
  who: string;                 // nick | back | other | tag:<тег>
  chance: number;
  delay: [number, number];
  mute?: 'stream' | 'run';
  lines: ChatEntry[];
}

export interface ChatRegular {
  nick: string;
  tags: string[];
  bunker: number | null;
  weight?: number;
  badge?: string;
  generic?: boolean;
  manner?: string;
}

export interface ChatConfig {
  version?: number;
  stages?: Record<string, [number, number]>;
  bunkers?: { min: number; max: number };
  layers?: Record<string, Record<string, number>>;
  nicks: string[];
  regulars?: ChatRegular[];
  messages: Record<string, ChatEntry[]>;
  replies?: Record<string, ChatReplyPool>;
}

export interface PlaceholderSpec {
  shape: 'rect' | 'circle';
  w: number;
  h: number;
  color: string;
}

export interface AnimSpec { frames: number[]; fps: number }

export interface BobSpec { amp: number; freq: number; squash: number }

export interface SpriteSpec {
  variants?: string[];
  sheet?: string | null;
  image?: string | null;
  frameWidth?: number;
  frameHeight?: number;
  scale?: number;
  origin?: [number, number];
  weaponAnchor?: [number, number];
  anims?: Record<string, AnimSpec>;
  mirror?: Record<string, string>;
  placeholder?: PlaceholderSpec;
  bob?: BobSpec;
}

/** Звук: файл (`path`) или цепочка других звуков (`sequence`), которые играют один за другим. */
export interface SoundSpec {
  path?: string | null;
  volume?: number;       // 0…1, умножается на soundVolume
  detune?: number;       // случайный сдвиг высоты ± центов при каждом проигрывании
  max?: number;          // сколько копий может звучать одновременно
  sequence?: string[];
  interrupt?: boolean;   // новая цепочка обрывает хвост предыдущей (по умолчанию да)
  tailToPeriod?: boolean; // выстрел: хвост обрезается до интервала между выстрелами, ритм очереди слышен при любой скорости
  rateScale?: number;    // выстрел: ускорение воспроизведения от скорости атаки, 1 + rateScale·(скорострельность/базовая − 1)
  maxRate?: number;      // предел ускорения (по умолчанию 1.5)
}

export interface AssetsConfig {
  portraits: Record<HeroineId, { base: string | null; selected: string | null; background: string | null }>;
  sprites: Record<string, SpriteSpec>;
  images: Record<string, string | null>;
  soundVolume?: number;
  sounds?: Record<string, SoundSpec>;
  music?: { path?: string | null; volume?: number };  // фоновый трек по кругу; громкость × ползунок «Музыка»
}

export interface TaskState {
  type: TaskType;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  rewardPaid: boolean;
}

export interface StreamState {
  phase: 'intro' | 'fight' | 'settle' | 'summary';
  styleRaw: number;
  kills: number;
  combo: number;
  coinsFromDrops: number;
  task: TaskState;
  isBossStream: boolean;
  bossDead: boolean;
  thresholdReached: boolean;
  elapsed: number;
  settled: boolean;
}

export interface RunState {
  heroineId: HeroineId;
  stream: number;
  coins: number;
  statPoints: Record<StatId, number>;
  purchases: Record<StatId, number>;
  totalStyle: number;
  totalKills: number;
  current: StreamState | null;
}
