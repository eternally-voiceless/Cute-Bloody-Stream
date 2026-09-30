import type { Balance, ChatConfig, ChatEntry, ChatEntryObj, ChatRegular, HeroineId, TaskState } from '../types';
import type { ChatPanel } from '../ui/chatPanel';
import { plural, taskText } from './tasks';

// Чат стрима (ТЗ, раздел 12; формат и логика — chat-proposal/CHAT-LOGIC.md).
// Слои категорий, условия, веса, завсегдатаи, бункеры, ответы и цепочки, мут троллей, «залпы» сообщений.

const HIGH = new Set([
  'boss_spawn', 'boss_kill', 'task_new', 'task_done', 'task_failed', 'low_hp', 'death', 'final', 'stream_end', 'goal_reached',
]);
const RANKS_DEFAULT = ['D', 'C', 'B', 'A', 'S', 'SS'];

/** Состояние игры для условий и переменных. Сцена заполняет то, что знает. */
export interface ChatState {
  heroineId: HeroineId;
  cleared?: boolean;
  stream?: number;
  isBossStream?: boolean;
  bossAlive?: boolean;
  hpRatio?: number;
  combo?: number;
  rank?: string;
  rankIndex?: number;
  viewers?: number;
  kills?: number;
  task?: TaskState;
  donor?: string;
}

/** Данные конкретного события. */
export interface ChatVars {
  enemyId?: string;
  variant?: number;
  rank?: string;
  combo?: number;
  viewers?: number;
  n?: number;
}

/** Память чата на весь забег: переживает смену сцен. */
interface ChatMemory {
  recentTexts: string[];
  lastUsed: Map<string, number>;
  usedOnce: Set<string>;
  mutedRun: Set<string>;
  milestones: Set<number>;
  counter: number;
}

let memory: ChatMemory = newMemory();

function newMemory(): ChatMemory {
  return { recentTexts: [], lastUsed: new Map(), usedOnce: new Set(), mutedRun: new Set(), milestones: new Set(), counter: 0 };
}

/** Сброс при старте нового забега. */
export function resetChatMemory(): void {
  memory = newMemory();
}

/** Рубеж зрителей уже объявлялся в этом забеге? Отмечает его. */
export function takeViewersMilestone(b: Balance, viewers: number): number | null {
  for (const m of b.chat.viewersMilestones ?? []) {
    if (viewers >= m && !memory.milestones.has(m)) {
      memory.milestones.add(m);
      return m;
    }
  }
  return null;
}

type Priority = 'H' | 'N' | 'L';

interface Ctx {
  author: string;
  nick: string;
  replyTo?: string;
  depth: number;
}

interface Item {
  category: string;
  text: string;
  author: string;
  badge?: string;
  priority: Priority;
  entry: ChatEntryObj;
  ctx: Ctx;
  vars: ChatVars;
  mute?: 'stream' | 'run';
  muteTarget?: string;
}

interface Pending { due: number; run: () => void }

function norm(e: ChatEntry): ChatEntryObj {
  return typeof e === 'string' ? { text: e } : e;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function pickWeighted<T>(items: T[], weight: (t: T) => number): T | undefined {
  const total = items.reduce((s, t) => s + Math.max(0, weight(t)), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (const t of items) {
    r -= Math.max(0, weight(t));
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

const warned = new Set<string>();
function warnOnce(key: string, msg: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

export class ChatSystem {
  private queue: Item[] = [];
  private pending: Pending[] = [];
  private clock = 0;
  private lastEmit = -Infinity;
  private idleTimer = 0;
  private lastByCategory = new Map<string, number>();
  private recentAuthors: string[] = [];
  private mutedStream = new Set<string>();
  private getState: () => ChatState;
  private regulars: ChatRegular[];
  private rankOrder: string[];

  /** Категория фона: `idle` на стриме, `select_<id>` в selected_mode, '' — без фона. */
  idleCategory = 'idle';

  constructor(
    private panel: ChatPanel,
    private cfg: ChatConfig,
    private b: Balance,
    private heroineId: HeroineId,
  ) {
    this.getState = () => ({ heroineId });
    this.regulars = cfg.regulars ?? [];
    this.rankOrder = (b.style.hype ?? []).map((h) => h.rank);
    if (this.rankOrder.length === 0) this.rankOrder = RANKS_DEFAULT;
  }

  setState(fn: () => ChatState): void {
    this.getState = fn;
  }

  // ---------- авторы и бункеры ----------

  private isMuted(nick: string): boolean {
    return this.mutedStream.has(nick) || memory.mutedRun.has(nick);
  }

  private regularsByTag(tag: string): ChatRegular[] {
    return this.regulars.filter((r) => r.tags.includes(tag) && !this.isMuted(r.nick));
  }

  private bunkerOf(nick: string): string {
    const r = this.regulars.find((x) => x.nick === nick);
    if (r) return r.bunker === null ? '???' : String(r.bunker);
    const { min, max } = this.cfg.bunkers ?? { min: 1, max: 99 };
    return String(min + (hash(nick) % (max - min + 1)));
  }

  private randomViewer(exclude: string[]): string {
    const nicks = this.cfg.nicks.length ? this.cfg.nicks : ['viewer'];
    for (let i = 0; i < 12; i++) {
      const n = nicks[Math.floor(Math.random() * nicks.length)];
      if (!exclude.includes(n) && !this.recentAuthors.includes(n) && !this.isMuted(n)) return n;
    }
    return nicks[Math.floor(Math.random() * nicks.length)];
  }

  /** Автор записи; null — запись нельзя показать (нет подходящего завсегдатая). */
  private chooseAuthor(e: ChatEntryObj, exclude: string[]): string | null {
    const st = this.getState();
    if (e.by === 'donor') return st.donor ?? null;
    if (e.by) {
      const list = this.regularsByTag(e.by).filter((r) => !exclude.includes(r.nick));
      const r = pickWeighted(list, (x) => x.weight ?? 1);
      return r ? r.nick : null;
    }
    const share = this.b.chat.regularShare ?? 0;
    if (Math.random() < share) {
      const list = this.regulars.filter((r) => r.generic !== false && !this.isMuted(r.nick) && !exclude.includes(r.nick));
      const r = pickWeighted(list, (x) => x.weight ?? 1);
      if (r) return r.nick;
    }
    return this.randomViewer(exclude);
  }

  private chooseMention(e: ChatEntryObj, author: string): string {
    const st = this.getState();
    if (e.nick === 'donor' && st.donor && st.donor !== author) return st.donor;
    const recent = this.recentAuthors.filter((n) => n !== author);
    if (recent.length > 0 && Math.random() < (this.b.chat.mentionRecentShare ?? 0)) {
      return recent[Math.floor(Math.random() * recent.length)];
    }
    const pool = [...this.cfg.nicks, ...this.regulars.filter((r) => r.generic !== false).map((r) => r.nick)]
      .filter((n) => n !== author);
    return pool[Math.floor(Math.random() * pool.length)] ?? 'viewer';
  }

  // ---------- условия ----------

  private check(cond: Record<string, unknown> | undefined, vars: ChatVars): boolean {
    if (!cond) return true;
    const st = this.getState();
    const inList = (v: unknown, x: unknown) => (Array.isArray(v) ? v.includes(x) : v === x);
    const rankIdx = (r: string | undefined) => (r === undefined ? -1 : this.rankOrder.indexOf(r));
    for (const [k, v] of Object.entries(cond)) {
      let ok: boolean;
      switch (k) {
        case 'heroine': ok = inList(v, st.heroineId); break;
        case 'stage': {
          if (st.stream === undefined) { ok = false; break; }
          const stages = this.cfg.stages ?? {};
          const names = Array.isArray(v) ? v : [v];
          ok = names.some((name) => {
            const r = stages[name as string];
            return !!r && st.stream! >= r[0] && st.stream! <= r[1];
          });
          break;
        }
        case 'stream':
          if (st.stream === undefined) ok = false;
          else if (Array.isArray(v)) ok = st.stream >= (v[0] as number) && st.stream <= (v[1] as number);
          else ok = st.stream === v;
          break;
        case 'boss': ok = st.isBossStream === v; break;
        case 'bossAlive': ok = (st.bossAlive ?? false) === v; break;
        case 'enemy': ok = vars.enemyId !== undefined && inList(v, vars.enemyId); break;
        case 'variant': ok = vars.variant === v; break;
        case 'rank': ok = inList(v, vars.rank ?? st.rank); break;
        case 'rankMin': ok = rankIdx(vars.rank ?? st.rank) >= rankIdx(v as string); break;
        case 'comboMin': ok = (st.combo ?? -1) >= (v as number); break;
        case 'hpBelow': ok = st.hpRatio !== undefined && st.hpRatio < (v as number); break;
        case 'hpAbove': ok = st.hpRatio !== undefined && st.hpRatio > (v as number); break;
        case 'viewersMin': ok = st.viewers !== undefined && st.viewers >= (v as number); break;
        case 'viewersMax': ok = st.viewers !== undefined && st.viewers <= (v as number); break;
        case 'killsMin': ok = st.kills !== undefined && st.kills >= (v as number); break;
        case 'task': ok = !!st.task && inList(v, st.task.type); break;
        case 'taskDone': ok = !!st.task && st.task.completed === v; break;
        case 'taskNear': {
          const t = st.task;
          const near = !!t && !t.completed && t.progress / t.target >= (this.b.chat.taskNearRatio ?? 0.75);
          ok = near === v;
          break;
        }
        case 'cleared': ok = (st.cleared ?? false) === v; break;
        default:
          warnOnce(`if:${k}`, `[chat] неизвестное условие «${k}», запись пропущена`);
          ok = false;
      }
      if (!ok) return false;
    }
    return true;
  }

  // ---------- выбор записи ----------

  private layersFor(category: string, vars: ChatVars): { entries: ChatEntryObj[]; share: number }[] {
    const M = this.cfg.messages;
    const base = (M[category] ?? []).map(norm);
    if (category.startsWith('select_')) return [{ entries: base, share: 1 }];
    const special: { type: string; key: string }[] = [
      { type: 'heroine', key: `${category}_${this.heroineId}` },
    ];
    if (vars.enemyId) special.push({ type: 'enemy', key: `${category}_${vars.enemyId}` });
    const task = this.getState().task;
    if (category.startsWith('task_') && task) special.push({ type: 'task', key: `${category}_${task.type}` });
    const present = special.filter((s) => M[s.key]);

    // Старый режим: без layers вариант героини заменяет общую категорию.
    if (!this.cfg.layers) {
      const h = present.find((s) => s.type === 'heroine');
      return [{ entries: h ? M[h.key].map(norm) : base, share: 1 }];
    }
    const L = this.cfg.layers;
    const out: { entries: ChatEntryObj[]; share: number }[] = [];
    let sum = 0;
    for (const s of present) {
      const share = L[category]?.[s.type] ?? L.default?.[s.type] ?? 0;
      sum += share;
      out.push({ entries: M[s.key].map(norm), share });
    }
    out.push({ entries: base, share: Math.max(0, 1 - sum) });
    return out;
  }

  private candidates(entries: ChatEntryObj[], vars: ChatVars, useRecent: boolean): ChatEntryObj[] {
    const authorOk = (e: ChatEntryObj) =>
      !e.by ? true : e.by === 'donor' ? !!this.getState().donor : this.regularsByTag(e.by).length > 0;
    return entries.filter((e) =>
      this.check(e.if, vars) &&
      authorOk(e) &&
      !(e.once && memory.usedOnce.has(e.text)) &&
      !(useRecent && memory.recentTexts.includes(e.text)));
  }

  private pick(layers: { entries: ChatEntryObj[]; share: number }[], vars: ChatVars): ChatEntryObj | null {
    let pool = layers.map((l) => ({ c: this.candidates(l.entries, vars, true), share: l.share })).filter((l) => l.c.length > 0);
    let entry: ChatEntryObj | undefined;
    if (pool.length > 0) {
      if (pool.every((l) => l.share <= 0)) pool = pool.map((l) => ({ ...l, share: 1 }));
      const layer = pickWeighted(pool, (l) => l.share)!;
      entry = pickWeighted(layer.c, (e) => e.weight ?? 1);
    } else {
      // Запасной вариант: без фильтра повторов, самая давно использованная запись.
      const all = layers.flatMap((l) => this.candidates(l.entries, vars, false));
      if (all.length === 0) return null;
      all.sort((a, b) => (memory.lastUsed.get(a.text) ?? -1) - (memory.lastUsed.get(b.text) ?? -1));
      entry = all[0];
    }
    if (!entry) return null;
    memory.counter++;
    memory.recentTexts.push(entry.text);
    const max = this.b.chat.recentTextMemory ?? 30;
    while (memory.recentTexts.length > max) memory.recentTexts.shift();
    memory.lastUsed.set(entry.text, memory.counter);
    if (entry.once) memory.usedOnce.add(entry.text);
    return entry;
  }

  // ---------- переменные ----------

  private fill(text: string, ctx: Ctx, vars: ChatVars): string {
    const st = this.getState();
    const t = st.task;
    const val = (name: string): string | undefined => {
      switch (name) {
        case 'author': return ctx.author;
        case 'nick': return ctx.nick;
        case 'bunker': return this.bunkerOf(ctx.author);
        case 'nickBunker': return this.bunkerOf(ctx.nick);
        case 'randomBunker': {
          const { min, max } = this.cfg.bunkers ?? { min: 1, max: 99 };
          return String(Math.floor(rand(min, max + 1)));
        }
        case 'streamer': return this.b.heroines[st.heroineId]?.name;
        case 'stream': return st.stream !== undefined ? String(st.stream) : undefined;
        case 'streamsLeft': return st.stream !== undefined ? String(20 - st.stream) : undefined;
        case 'n': return vars.n !== undefined ? String(vars.n) : st.stream !== undefined ? String(st.stream) : undefined;
        case 'viewers': {
          const v = vars.viewers ?? st.viewers;
          return v !== undefined ? v.toLocaleString('ru-RU') : undefined;
        }
        case 'combo': return String(vars.combo ?? st.combo ?? 0);
        case 'rank': return vars.rank ?? st.rank;
        case 'kills': return st.kills !== undefined ? String(st.kills) : undefined;
        case 'donor': return st.donor;
        case 'task': {
          if (!t) return undefined;
          const s = taskText(t);
          return s.charAt(0).toLowerCase() + s.slice(1);
        }
        case 'target': return t ? String(t.target) : undefined;
        case 'left': return t ? String(Math.max(0, t.target - Math.floor(t.progress))) : undefined;
        case 'amount': return t ? `${t.reward} ${plural(t.reward, 'монета', 'монеты', 'монет')}` : undefined;
        case 'enemy': {
          if (!vars.enemyId) return undefined;
          const name = vars.enemyId === 'boss_hater' ? this.b.boss.name : this.b.enemies[vars.enemyId]?.name;
          return name?.toLowerCase();
        }
        default: return undefined;
      }
    };
    return text.replace(/\{(\w+)\}/g, (m, name: string) => {
      const v = val(name);
      if (v === undefined) {
        warnOnce(`var:${name}`, `[chat] переменная {${name}} недоступна здесь, оставлена как есть`);
        return m;
      }
      return v;
    });
  }

  // ---------- сборка и показ ----------

  private badgeOf(nick: string): string | undefined {
    return this.regulars.find((r) => r.nick === nick)?.badge;
  }

  private build(category: string, vars: ChatVars, priority: Priority): Item | null {
    const entry = this.pick(this.layersFor(category, vars), vars);
    if (!entry) return null;
    const author = this.chooseAuthor(entry, []);
    if (!author) return null;
    const ctx: Ctx = { author, nick: this.chooseMention(entry, author), depth: 0 };
    return { category, text: this.fill(entry.text, ctx, vars), author, badge: this.badgeOf(author), priority, entry, ctx, vars };
  }

  private emit(item: Item): void {
    this.panel.add(item.author, item.text, item.priority === 'H', item.badge);
    this.lastEmit = this.clock;
    this.recentAuthors.push(item.author);
    const max = this.b.chat.recentAuthorMemory ?? 8;
    while (this.recentAuthors.length > max) this.recentAuthors.shift();
    if (item.mute && item.muteTarget) {
      if (item.mute === 'run') memory.mutedRun.add(item.muteTarget);
      else this.mutedStream.add(item.muteTarget);
    }
    this.scheduleReply(item);
  }

  private enqueue(item: Item, front = false): void {
    if (item.priority === 'H') {
      this.emit(item);
      return;
    }
    if (front) this.queue.unshift(item);
    else this.queue.push(item);
    const limit = this.b.chat.queueMax;
    while (this.queue.length > limit) {
      // Сначала отбрасываем фон, потом самые старые обычные.
      const low = this.queue.findIndex((q) => q.priority === 'L');
      this.queue.splice(low >= 0 ? low : 0, 1);
    }
  }

  // ---------- ответы ----------

  private scheduleReply(parent: Item): void {
    const id = parent.entry.reply;
    if (!id) return;
    const pool = this.cfg.replies?.[id];
    if (!pool) {
      warnOnce(`reply:${id}`, `[chat] нет пула ответов «${id}»`);
      return;
    }
    const rc = this.b.chat.reply ?? { maxDepth: 2, maxPending: 3 };
    if (parent.ctx.depth + 1 > rc.maxDepth) return;
    if (this.pending.length >= rc.maxPending) return;
    if (Math.random() >= pool.chance) return;
    const due = this.clock + rand(pool.delay[0], pool.delay[1]);
    this.pending.push({ due, run: () => this.reply(parent, id) });
  }

  private reply(parent: Item, poolId: string): void {
    const pool = this.cfg.replies![poolId];
    const p = parent.ctx;
    let author: string | null = null;
    const exclude = [p.author, p.nick, p.replyTo ?? ''];
    if (pool.who === 'nick') author = p.nick;
    else if (pool.who === 'back') author = p.replyTo ?? null;
    else if (pool.who.startsWith('tag:')) {
      const r = pickWeighted(this.regularsByTag(pool.who.slice(4)).filter((x) => x.nick !== p.author), (x) => x.weight ?? 1);
      author = r?.nick ?? null;
    }
    if (!author || author === p.author || this.isMuted(author)) author = this.randomViewer(exclude);
    const entries = pool.lines.map(norm).filter((e) => !e.by || this.regularsByTag(e.by).some((r) => r.nick === author) || e.by === 'donor');
    const entry = this.pick([{ entries, share: 1 }], parent.vars);
    if (!entry) return;
    const ctx: Ctx = { author, nick: p.author, replyTo: p.author, depth: p.depth + 1 };
    this.enqueue({
      category: `reply:${poolId}`, text: this.fill(entry.text, ctx, parent.vars), author, badge: this.badgeOf(author),
      priority: 'N', entry, ctx, vars: parent.vars, mute: pool.mute, muteTarget: pool.mute ? p.author : undefined,
    });
  }

  /** Отменить запланированные ответы и очередь (смерть героини, смена сцены). */
  cancelPending(): void {
    this.pending = [];
    this.queue = [];
  }

  // ---------- события ----------

  /** Событие игры → сообщение(я) в чат с учётом приоритета, шанса, кулдауна и «залпа». */
  event(category: string, vars: ChatVars = {}): void {
    const c = this.b.chat;
    const chance = category === 'rank_up' ? (c.rankUpChance?.[vars.rank ?? ''] ?? 1) : c.eventChance[category];
    if (chance !== undefined) {
      const cd = c.cooldowns?.[category] ?? c.categoryCooldown;
      const last = this.lastByCategory.get(category) ?? -Infinity;
      if (category !== 'rank_up' && this.clock - last < cd) return;
      if (Math.random() >= chance) return;
      this.lastByCategory.set(category, this.clock);
    }
    const priority: Priority = HIGH.has(category) ? 'H'
      : category === this.idleCategory || category.startsWith('select_') ? 'L' : 'N';
    const item = this.build(category, vars, priority);
    if (item) this.enqueue(item);
    // Залп: ещё несколько человек пишут то же событие.
    const extra = (c.burst?.[category] ?? 1) - 1;
    const gap = c.burstGap ?? [0.25, 0.45];
    let t = this.clock;
    for (let i = 0; i < extra; i++) {
      t += rand(gap[0], gap[1]);
      this.pending.push({ due: t, run: () => { const it = this.build(category, vars, 'N'); if (it) this.enqueue(it, true); } });
    }
  }

  /** combo — текущая серия: чем длиннее, тем чаще фоновые сообщения. */
  update(dt: number, combo = 0): void {
    this.clock += dt;
    const c = this.b.chat;
    if (this.idleCategory) {
      const k = Math.min(1, combo / Math.max(1, this.b.style.comboCap));
      const interval = c.baseInterval + (c.minInterval - c.baseInterval) * k;
      this.idleTimer += dt;
      if (this.idleTimer >= interval) {
        this.idleTimer = 0;
        this.event(this.idleCategory);
      }
    }
    if (this.pending.length > 0) {
      const due = this.pending.filter((p) => p.due <= this.clock);
      if (due.length > 0) {
        this.pending = this.pending.filter((p) => p.due > this.clock);
        for (const p of due) p.run();
      }
    }
    if (this.queue.length > 0 && this.clock - this.lastEmit >= 1 / c.maxPerSecond) {
      this.emit(this.queue.shift() as Item);
    }
  }
}
