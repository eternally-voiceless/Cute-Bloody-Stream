import type { Balance, ChatConfig, HeroineId } from '../types';
import type { ChatPanel } from '../ui/chatPanel';

// Логика чата: фон, частые события, приоритеты, лимиты (ТЗ, раздел 12).

const HIGH_PRIORITY = new Set([
  'boss_spawn', 'boss_kill', 'task_new', 'task_done', 'task_failed', 'low_hp', 'death', 'final', 'stream_end',
]);
const FREQUENT = new Set(['kill', 'crit', 'long_shot', 'close_kill', 'player_hit']);

interface Item { category: string; nick: string; text: string }

export class ChatSystem {
  private queue: Item[] = [];
  private clock = 0;
  private lastEmit = -Infinity;
  private idleTimer = 0;
  private lastByCategory = new Map<string, number>();
  private lastText = new Map<string, string>();

  /** Категория фоновых сообщений: `idle` на стриме, `select_<id>` в selected_mode. */
  idleCategory = 'idle';

  constructor(
    private panel: ChatPanel,
    private cfg: ChatConfig,
    private b: Balance,
    private heroineId: HeroineId,
  ) {}

  private pool(category: string): string[] {
    return this.cfg.messages[`${category}_${this.heroineId}`] ?? this.cfg.messages[category] ?? [];
  }

  private make(category: string, vars: Record<string, string | number>): Item | null {
    const pool = this.pool(category);
    if (pool.length === 0) return null;
    let text = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && text === this.lastText.get(category)) {
      text = pool[(pool.indexOf(text) + 1) % pool.length];
    }
    this.lastText.set(category, text);
    const nicks = this.cfg.nicks.length ? this.cfg.nicks : ['viewer'];
    const nick = nicks[Math.floor(Math.random() * nicks.length)];
    const other = nicks[Math.floor(Math.random() * nicks.length)];
    text = text.replace(/\{nick\}/g, other);
    for (const [k, v] of Object.entries(vars)) text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    return { category, nick, text };
  }

  /** Событие игры → сообщение в чат с учётом приоритета, вероятности и кулдауна. */
  event(category: string, vars: Record<string, string | number> = {}): void {
    if (FREQUENT.has(category)) {
      const chance = this.b.chat.eventChance[category] ?? 0;
      const last = this.lastByCategory.get(category) ?? -Infinity;
      if (this.clock - last < this.b.chat.categoryCooldown) return;
      if (Math.random() >= chance) return;
      this.lastByCategory.set(category, this.clock);
    }
    const item = this.make(category, vars);
    if (!item) return;
    if (HIGH_PRIORITY.has(category)) {
      // Высокий приоритет обходит лимит.
      this.emit(item, true);
      return;
    }
    this.queue.push(item);
    while (this.queue.length > this.b.chat.queueMax) {
      // Отбрасываем самое низкоприоритетное: сначала фон, потом самое старое.
      const idleIdx = this.queue.findIndex((q) => q.category === this.idleCategory);
      this.queue.splice(idleIdx >= 0 ? idleIdx : 0, 1);
    }
  }

  private emit(item: Item, highlight: boolean): void {
    this.panel.add(item.nick, item.text, highlight);
    this.lastEmit = this.clock;
  }

  /** combo — текущая серия: чем длиннее, тем чаще фоновые сообщения. */
  update(dt: number, combo = 0): void {
    this.clock += dt;
    const c = this.b.chat;
    const t = Math.min(1, combo / Math.max(1, this.b.style.comboCap));
    const interval = c.baseInterval + (c.minInterval - c.baseInterval) * t;
    this.idleTimer += dt;
    if (this.idleTimer >= interval) {
      this.idleTimer = 0;
      this.event(this.idleCategory);
    }
    if (this.queue.length > 0 && this.clock - this.lastEmit >= 1 / c.maxPerSecond) {
      this.emit(this.queue.shift() as Item, false);
    }
  }
}
