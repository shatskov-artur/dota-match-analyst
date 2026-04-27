# Phase 7: In-Game Item Intel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 07-in-game-item-intel
**Areas discussed:** Placement, Item mapping, Visual design, Slots

---

## Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Новая секция рядом | Items-блок — отдельная секция ниже HeroPlayerGrid. HeroPlayerGrid остаётся как есть (K/D/A, GPM, LH). Items-блок сортирован по NW по всем 10 героям. Обе секции видны одновременно. | ✓ |
| Расширить HeroPlayerGrid | Добавить 6 item-иконок прямо в каждый PlayerRow. Сортировка остаётся по командам. NW-ранкинг теряется — просто иконки в ряд. | |
| Заменить HeroPlayerGrid | Items-блок (sorted by NW) полностью заменяет HeroPlayerGrid. Убрать дублирование NW. Но теряем K/D/A, GPM, LH/DN из основного вида. | |

**User's choice:** Новая секция рядом (Recommended)

---

## Item mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Bundle items.json | Скачать один раз из OpenDota /constants/items, сохранить как shared/items.json. Тот же паттерн, что heroes.json — быстро и без runtime-запросов. Актуализировать вручную при патчах — предметы меняются реже героев. | ✓ |
| Fetch from OpenDota в runtime | BFF-маршрут фетчит /constants/items при старте, кеширует в Redis (TTL 24h). Всегда актуальный маппинг. Добавляет GET /api/items/constants или инициализирует при запуске сервера. | |
| ID на CDN напрямую | Если CDN поддерживает URL с item_id — маппинг не нужен. Но Roadmap указывает паттерн {item_name}.png, не {item_id}.png — поэтому скорее всего не работает. | |

**User's choice:** Bundle items.json (Recommended)

---

## Visual design

### Row layout

| Option | Description | Selected |
|--------|-------------|----------|
| Rank + портрет + NW + предметы | # позиция (цвет команды), портрет героя (48px), NW как основное число, затем 6 item-иконок. Без имени игрока — оно уже в HeroPlayerGrid. | ✓ |
| портрет + имя + NW + предметы | Портрет (48px) + имя героя (flex-1) + NW + иконки. Аналогично HeroPlayerGrid, только вместо K/D/A — items. Визуально хорошо но больше места. | |

**User's choice:** Rank + портрет + NW + предметы (Recommended)

### Team color indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Цвет номера ранга | #1 = зелёный (#4ade80) если Radiant, красный (#ef4444) если Dire. Номер цветом сразу несёт команду. Просто и лаконично. | ✓ |
| Левая полоска (team bar) | 2-3px полоска слева от портрета — зелёная/красная. Номер ранга остаётся белым. | |
| Claude's discretion | Доверяю выбор реализации Claude — главное, чтобы Radiant/Dire отличались. | |

**User's choice:** Цвет номера ранга (Recommended)

---

## Neutral item & backpack

| Option | Description | Selected |
|--------|-------------|----------|
| Только 6 холдов (item0–5) | Строго по Success Criteria — 6 слотов. Neutral item и backpack игнорировать, даже если API их даёт. Минимальная сложность. | |
| 6 + neutral item если доступен | item0–5 обязательно, neutral item_neutral (7-й слот) отдельно если API его возвращает. Без backpack. | |
| 6 + neutral + backpack если доступны | Всё что есть в API: холд + neutral + backpack. Наибольшая полнота, но ширина строки растёт. | ✓ |

**User's choice:** 6 + neutral + backpack если доступны
**Notes:** Показывать все доступные данные; визуальная группировка (gap между основными/neutral/backpack) — Claude's discretion.

---

## Claude's Discretion

- Exact item slot visual sizing (32–36px recommended)
- Whether to add item fields explicitly to PlayerSchema or rely on passthrough
- Items Block section header wording
- CSS styling for empty slot placeholder
- Neutral slot visual distinction
- Whether to use itemMapper.ts in shared/ or inline lookup
- Data path choice: extend draft route vs add to live games route

## Deferred Ideas

- Item tooltips (hover → name + description) — v2
- Item build progression over time — requires Phase 10 infra
- Item cost / power spike indicator — v2
- Aghanim's Scepter/Shard special highlight — cosmetic, Claude's discretion if trivial
