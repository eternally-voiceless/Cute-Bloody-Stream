# Cute Bloody Stream

Браузерная арена-выживалка с автострельбой (Phaser 3.90 + TypeScript + Vite). Постапокалипсис, стримерша проводит 20 стримов-волн, между стримами покупает улучшения, после 20-го улетает на вертолёте.

Спецификация — `../TOR1-v2.md`. Этот файл описывает запуск, выкладку и **каждый параметр** конфигов.

## Запуск и сборка

```bash
cd game
npm install
npm run dev        # http://localhost:5173
npm run build      # проверка типов + сборка в game/dist
npm run preview    # локальный просмотр сборки
```

Сборка — статические файлы в `dist/`. Все пути относительные (`base: './'`), поэтому игра работает из любой подпапки.

## Выкладка на GitHub Pages

Workflow `../.github/workflows/pages.yml` собирает `game/` и выкладывает `game/dist` при каждом пуше в `main`.

1. Создать репозиторий на GitHub и запушить `main`.
2. В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. После пуша игра будет доступна по адресу `https://<user>.github.io/<repo>/`.

## Управление

WASD или стрелки — движение. Стрельба автоматическая по ближайшему врагу в радиусе. `Esc` — пауза.

## Отладочный режим

Параметры URL, например `?debug=1&heroine=kuudere&stream=20&god=1&coins=500`:

| Параметр | Действие |
|---|---|
| `debug=1` | Счётчик FPS и врагов; `F9` — завершить текущий стрим; объект `window.cbs` (`game`, `ctx`) в консоли |
| `heroine=<id>` | Сразу начать забег этой героиней (`genki`, `kuudere`, `yandere`), минуя экран выбора |
| `stream=<n>` | Начать со стрима n (1–20) |
| `god=1` | Героиня не получает урон |
| `coins=<n>` | Стартовые монеты |
| `speed=<n>` | Ускорение боя в n раз (1–8), только для автотестов баланса |

## Структура

```
public/config/balance.json   все числа игры
public/config/chat.json      ники и сообщения чата
public/config/assets.json    пути к картинкам и спрайт-листам
public/assets/img/<id>/      вырезанные портреты и фоны-бункеры (копия ../img)
src/scenes/    Boot, Select, Night (стрим), Day (магазин), Result, Final
src/systems/   context, run, stats, style, spawn, tasks, shop, chat, save, assets, debug
src/entities/  Player, Enemy, Boss, Projectile, Coin
src/ui/        HUD, чат (DOM), виджеты, цифры урона
```

Конфиги грузятся при запуске. Правка `balance.json`, `chat.json` или `assets.json` в собранной игре (`dist/config/`) применяется после перезагрузки страницы.

---

## `balance.json`

Обозначения: n — номер стрима (1…20), `F(s) = clamp(1 + s/100, minFactor, maxFactor)` — множитель стата.

### `world`

| Параметр | Смысл |
|---|---|
| `arena.width`, `arena.height` | Размер арены в пикселях. Больше экрана 1920×1080, камера следует за героиней |
| `camera.lerp` | Плавность следования камеры (0…1, больше — жёстче) |
| `separation` | Доля перекрытия, на которую враги расталкивают друг друга за кадр (0 — проходят сквозь, 1 — жёстко) |

### `stats`

| Параметр | Смысл |
|---|---|
| `minFactor`, `maxFactor` | Границы множителя `F(s)` |
| `armorK` | Константа брони: получаемый урон × (1 − A/(A + armorK)) |
| `regenAlpha` | Делитель регенерации: HP в секунду = regen / regenAlpha |

### `player`

| Параметр | Смысл |
|---|---|
| `invulnerability` | Секунды неуязвимости после получения урона |
| `size` | Диаметр хитбокса героини, px (и размер квадрата-плейсхолдера) |
| `lowHpRatio` | Доля HP, ниже которой чат пишет `low_hp` (один раз, пока HP не поднимется выше) |

### `heroines.<id>`

| Параметр | Смысл |
|---|---|
| `name`, `archetype` | Имя и архетип для интерфейса |
| `color` | Цвет карточки и плейсхолдера героини |
| `weapon` | Ключ оружия из `weapons` |
| `baseHp` | Базовое здоровье: maxHp = baseHp · F(hp) |
| `baseMoveSpeed` | Базовая скорость, px/с: итог = baseMoveSpeed · F(moveSpeed) |
| `stats.<stat>` | Стартовые очки каждого из 9 статов (см. ниже) |
| `styleMultipliers` | Множители бонусов стиля: `crit`, `longShot`, `close`, `combo`. Отсутствующий = 1 |

Статы: `hp` здоровье, `damage` урон, `attackSpeed` скорость атаки, `moveSpeed` скорость передвижения, `range` дальность, `armor` броня (очки A), `regen` восстановление, `crit` шанс крита (процентные пункты, прибавляются к шансу оружия), `resourceSearch` шанс выпадения монеты в %.

### `weapons.<id>`

| Параметр | Смысл |
|---|---|
| `name` | Название |
| `damage` | Урон одного снаряда: итог = damage · F(damage) |
| `fireRate` | Выстрелов в секунду: итог = fireRate · F(attackSpeed) |
| `range` | Дальность, px: итог = range · F(range). Снаряд исчезает, пролетев её |
| `spread` | Полный угол разброса, градусы (случайно в ±spread/2) |
| `pellets` | Снарядов за выстрел |
| `pierce` | Число **дополнительных** целей (0 — только первая) |
| `pierceDamageFactor` | Множитель урона снаряда после каждого попадания |
| `projectileSpeed` | Скорость снаряда, px/с |
| `critChance` | Базовый шанс крита оружия, % |
| `critMultiplier` | Множитель урона при крите |
| `knockback` | Отталкивание врага за выстрел, px (× (1 − knockbackResist)) |

### `enemies.<id>`

| Параметр | Смысл |
|---|---|
| `name` | Название |
| `hp`, `damage` | Базовые HP и урон касанием; растут по `scaling` |
| `speed` | Скорость, px/с |
| `style` | Базовые очки стиля за убийство |
| `size` | Диаметр хитбокса, px (и размер плейсхолдера) |
| `color` | Цвет плейсхолдера |
| `weight` | Вес при случайном выборе типа |
| `fromStream` | С какого стрима появляется |
| `knockbackResist` | Сопротивление отталкиванию (0…1) |

### `boss`

| Параметр | Смысл |
|---|---|
| `name` | Название (полоса HP) |
| `streams` | Номера стримов с боссом |
| `hp`, `damage` | HP и урон касанием. **Не масштабируются** по `scaling` |
| `speed` | Скорость преследования, px/с |
| `style` | Стиль за убийство босса (без бонусов и серии) |
| `size`, `color` | Диаметр хитбокса и цвет плейсхолдера |
| `spawnOffset` | На сколько px за границей видимой области камеры появляется |
| `dash.cooldown` | Секунды между рывками |
| `dash.telegraph` | Секунды показа линии рывка перед ним |
| `dash.speed`, `dash.distance` | Скорость (px/с) и длина (px) рывка |
| `summon.cooldown`, `summon.count` | Период призыва и число шатунов |

### `scaling`

| Параметр | Смысл |
|---|---|
| `hpPerStream` | HP врага × (1 + (n − 1) · hpPerStream) |
| `damagePerStream` | Урон врага × (1 + (n − 1) · damagePerStream) |

### `spawn`

| Параметр | Смысл |
|---|---|
| `interval`, `intervalStep`, `minInterval` | Период групп: max(minInterval, interval − (n − 1) · intervalStep), с |
| `group`, `groupEvery` | Размер группы: group + floor((n − 1) / groupEvery) |
| `minDistance` | Минимальное расстояние точки появления от героини, px |
| `telegraph` | Секунды показа красного крестика до появления |
| `maxAlive` | Лимит живых врагов без босса; при нём спавн и призыв пропускаются |

### `style`

| Параметр | Смысл |
|---|---|
| `threshold.base`, `threshold.step` | Порог стрима S(n) = base + (n − 1) · step |
| `comboWindow` | Секунды без убийств до сброса серии |
| `comboStep`, `comboCap` | Множитель серии: 1 + min(combo, comboCap) · comboStep · hm.combo |
| `critBonus` | Бонус стиля за убийство критом |
| `longShotRatio`, `longShotBonus` | Дальнее убийство: расстояние ≥ longShotRatio · дальность; бонус |
| `closeDistance`, `closeBonus` | Убийство вплотную: расстояние ≤ closeDistance px; бонус |

Очки за убийство = round((enemy.style + бонусы) · множитель серии).

### `viewers`

| Параметр | Смысл |
|---|---|
| `base`, `perStyle` | Зрители LIVE = base + floor((totalStyle + styleRaw) · perStyle). Только визуал |

### `drops`

| Параметр | Смысл |
|---|---|
| `coinValue` | Номинал монеты |
| `magnetRadius` | Радиус притяжения монет к героине, px |
| `magnetSpeed` | Скорость притяжения монет, px/с |

### `economy`

| Параметр | Смысл |
|---|---|
| `styleToCoins` | В расчёте стрима начисляется floor(styleRaw · styleToCoins) монет |

### `tasks`

| Параметр | Смысл |
|---|---|
| `reward.base`, `reward.step` | Награда: base + (n − 1) · step монет |
| `expectedStylePerKill.base`, `.step` | Ожидаемое число убийств E(n) = S(n) / (base + (n − 1) · step) |
| `byHeroine.<id>` | Какие задания может получить героиня |
| `kills.share` | Цель: ceil(share · E(n)) |
| `crits.share`, `crits.minCritChance` | Цель: max(1, ceil(share · E(n) · шанс крита / 100)); не выдаётся при шансе ниже minCritChance % |
| `longShots.share`, `closeKills.share` | Цель: max(1, ceil(share · E(n))) |
| `combo.base`, `.step`, `.max` | Цель: min(base + (n − 1) · step, max) |
| `noHit.base`, `.step`, `.max` | Секунды без урона: min(base + (n − 1) · step, max) |

### `shop.<stat>`

| Параметр | Смысл |
|---|---|
| `name` | Название на кнопке |
| `increment` | Сколько очков стата даёт покупка |
| `basePrice`, `priceStep` | Цена k-й покупки этого стата: basePrice + k · priceStep |

### `chat`

| Параметр | Смысл |
|---|---|
| `baseInterval`, `minInterval` | Период фоновых сообщений, с; с ростом серии уменьшается до minInterval |
| `maxMessages` | Сколько сообщений хранит панель |
| `maxPerSecond` | Лимит обычных сообщений в секунду |
| `queueMax` | Длина очереди; при переполнении отбрасываются фоновые, затем самые старые |
| `categoryCooldown` | Минимум секунд между сообщениями одной частой категории |
| `eventChance.<cat>` | Вероятность сообщения на частое событие (`kill`, `crit`, `long_shot`, `close_kill`, `player_hit`) |

Сообщения высокого приоритета (`boss_spawn`, `boss_kill`, `task_new`, `task_done`, `task_failed`, `low_hp`, `death`, `final`, `stream_end`) обходят лимит и подсвечиваются.

---

## `chat.json`

```json
{ "nicks": ["..."], "messages": { "<категория>": ["..."], "<категория>_<heroineId>": ["..."] } }
```

- Подстановки: `{nick}` — случайный ник, `{n}` — номер стрима или длина серии.
- Вариант `<категория>_<heroineId>` (например `kill_yandere`) используется вместо общего, если он есть.
- Категории: `select_<id>`, `idle`, `stream_start`, `kill`, `combo`, `crit`, `long_shot`, `close_kill`, `player_hit`, `low_hp`, `task_new`, `task_done`, `task_failed`, `boss_spawn`, `boss_kill`, `stream_end`, `death`, `final`.

---

## `assets.json`

Пустое значение (`null`) или незагрузившийся файл → предупреждение в консоли и плейсхолдер. Хитбоксы от картинок не зависят.

### `portraits.<id>`

`base` — карточка на экране выбора, `selected` — героиня в selected_mode, `background` — фон-бункер (масштаб «cover»).

### `sprites.<key>`

Ключи: `hero_<id>`, `enemy_<id>`, `boss_hater`, `weapon_<weaponId>`.

| Поле | Смысл |
|---|---|
| `sheet` | Путь к спрайт-листу (кадры слева направо, сверху вниз) |
| `image` | Путь к одиночной картинке (для оружия) |
| `frameWidth`, `frameHeight` | Размер кадра листа |
| `scale` | Масштаб отрисовки |
| `origin` | Точка привязки [x, y] в долях кадра; [0.5, 0.9] — «ноги» |
| `weaponAnchor` | Смещение точки крепления оружия от позиции героини, px |
| `anims.<name>` | `frames` — номера кадров, `fps` — скорость. `death` проигрывается один раз |
| `mirror` | Какие анимации получаются отражением других, например `"move_left": "move_right"` |
| `placeholder` | Необязательно: `{ shape: rect|circle, w, h, color }`. Без него у героинь и врагов берутся `size` и `color` из `balance.json` |

Имена анимаций:
- героини: `idle_down|up|right|left`, `move_down|up|right|left` (на диагоналях — горизонтальное направление);
- враги: `move_<dir>` для 8 направлений (`down`, `down_right`, `right`, `up_right`, `up`, и левые), `attack_right|left`, `death`;
- босс: как враги плюс `telegraph_right|left`, `dash_right|left`, `summon`.

Цепочка отката: нужная анимация → её зеркальная пара → `idle_<dir>` → `idle_down` → кадр 0 → плейсхолдер.

**Подключение спрайт-листа:** положить файл в `public/assets/…`, вписать путь в `sheet` и номера кадров в `anims`. Код не меняется.

### `images`

`arena_bg` (тайл фона арены), `select_bg` (фон экрана выбора), `coin`, `spawn_marker`, `boss_arrow`, `helicopter`, `projectile_rifle`, `projectile_laser`, `projectile_shotgun`.
