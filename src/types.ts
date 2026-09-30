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
  max?: number;              // не больше стольких одновременно (с учётом ожидающих появления)
  falloff?: number;          // вес появления × falloff^(сколько уже есть): каждый следующий реже
  matchPlayerSpeed?: boolean; // не медленнее героини
  speedOfPlayer?: number;    // скорость = доля скорости героини (вместо speed)
  leap?: LeapConfig;
  cane?: CaneConfig;
}

/** Охотник: замирает рядом с героиней и прыгает по дуге с упреждением. */
export interface LeapConfig {
  radius: number;     // с какого расстояния начинает прыжок
  freeze: number;     // замирание перед прыжком, с (красная линия)
  distance: number;   // длина прыжка в радиусах
  speed: number;      // скорость прыжка, px/с
  lead: number;       // доля упреждения по скорости героини (1 — полная)
  cooldown: number;   // пауза между прыжками, с
}

/** Сталкер: бросает трость, схваченная героиня не может двигаться. */
export interface CaneConfig {
  range: number;      // дальность броска, px
  minRange: number;   // ближе не бросает
  telegraph: number;  // замах, с
  speed: number;      // скорость полёта, px/с
  hold: number;       // хват держится не дольше, с
  cooldown: number;   // пауза между бросками, с
  hand: [number, number]; // точка трости относительно ног (вправо; влево зеркально)
}

export interface AbilityConfig {
  push: { cooldown: number; radius: number; force: number; resistFactor: number };
  dash: { cooldown: number; distance: number; duration: number; invul: number; pushRadius: number; force: number };
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
  abilities: AbilityConfig;
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

/** Объект окружения арены: декаль на полу, объёмный объект за линией или огонь (`frames`). */
export interface ArenaProp {
  img?: string;
  frames?: string[];     // кадры огня вместо img
  x: number;
  y: number;
  flat?: boolean;        // декаль на полу (origin по центру), иначе origin (0.5, 1)
  scale?: number;
  angle?: number;
  flip?: boolean;
  alpha?: number;
  depthOf?: number;      // огонь: индекс объекта в props, на котором лежит пламя
}

/** Музыка: трек меню по кругу и плейлист забега. Громкость × ползунок «Музыка». */
export interface MusicConfig {
  volume?: number;
  menu?: string | null;     // главное меню, по кругу
  run?: string[];           // забег: треки по очереди, по кругу
  gap?: number;             // пауза между треками забега, с
  fade?: number;            // плавное затухание и нарастание, с
  startDelay?: number;      // задержка трека забега после начала 1-го стрима, с
  shopVolume?: number;      // громкость в магазине (день), доля
}

/** Забор по линии арены: тайлы по горизонтали и вертикали. */
export interface FenceConfig {
  h: string;              // горизонтальный тайл (верх и низ)
  v: string;              // вертикальный тайл (лево и право)
  scale?: number;
  bottomAlpha?: number;   // нижний забор, когда героиня рядом (перекрывает её)
}

export interface ArenaConfig {
  border?: number;          // видимая полоса за линией, px
  floorBrightness?: number; // яркость пола 0…1
  floorScale?: number;      // масштаб тайла пола
  dim?: number;             // яркость всего за линией
  fence?: FenceConfig;      // забор вместо розовой линии; нет — линия
  props?: ArenaProp[];
}

export interface AssetsConfig {
  portraits: Record<HeroineId, { base: string | null; selected: string | null; background: string | null }>;
  sprites: Record<string, SpriteSpec>;
  images: Record<string, string | null>;
  soundVolume?: number;
  sounds?: Record<string, SoundSpec>;
  music?: MusicConfig;
  arena?: ArenaConfig;
  cane?: { shaft: string; open: string; closed: string };  // трость сталкера: стержень-тайл и два конца
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
