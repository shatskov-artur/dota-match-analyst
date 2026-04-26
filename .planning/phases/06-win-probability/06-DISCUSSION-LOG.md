# Phase 6: Win Probability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-26
**Phase:** 06-win-probability
**Areas discussed:** Scope (Stratz counterpicks expansion), Counterpick data source, Win probability bar design, Graceful degradation, Polling & cache

---

## Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Stratz контрпики + Win probability + Graceful degradation + Polling | Все четыре области | ✓ |

**User's choice:** Все 4 области выбраны для обсуждения  
**Notes:** Пользователь пришёл в discuss-phase 6 специально чтобы добавить Stratz контрпики. Оба фича (win probability и контрпики) требуют одного Stratz сервиса — логично объединить в одной фазе.

---

## Counterpick Data Source

| Option | Description | Selected |
|--------|-------------|----------|
| Полная замена | Убрать OpenDota matchups, заменить на Stratz heroVsHeroMatchup PROFESSIONAL | ✓ |
| Stratz + OpenDota fallback | Stratz первый, при ошибке — OpenDota all-ranks | |
| Оставить OpenDota | Не менять Phase 5 | |

**User's choice:** Полная замена  
**Notes:** Fallback на разные источники смешивает семантику — лучше либо про-данные, либо ничего.

---

## Data Period for Counterpicks

| Option | Description | Selected |
|--------|-------------|----------|
| Все про-матчи | Исторические данные по всем профессиональным играм | ✓ |
| Текущий патч | Только последний патч — актуальнее но меньше данных | |

**User's choice:** Все про-матчи  
**Notes:** Бо́льшая выборка = меньше флуктуаций. Для редких hero pair может быть N=20 на патче vs тысячи за всё время.

---

## Win Probability Bar Position

| Option | Description | Selected |
|--------|-------------|----------|
| Под ScoreHeader | Сразу под счётом убийств и gold diff | ✓ |
| Над DraftSection | Между score и пиками | |
| Sticky header | Прилеплен к верху страницы при скролле | |

**User's choice:** Под ScoreHeader  
**Notes:** Группирует "кто выигрывает" контекст (kills, gold, probability) в одном блоке.

---

## Win Probability Bar Visual Style

| Option | Description | Selected |
|--------|-------------|----------|
| Зелёный/красный градиент | #4ade80 Radiant, #ef4444 Dire — соответствует теме проекта | ✓ |
| Нейтральный серый + акцент | Серая полоска с цветным акцентом на доминирующей стороне | |

**User's choice:** Зелёный/красный градиент  
**Notes:** Совпадает с существующей цветовой палитрой, не нужна новая переменная.

---

## Graceful Degradation

| Option | Description | Selected |
|--------|-------------|----------|
| Полностью скрыть | Бар не рендерится вообще, без error state | ✓ |
| Заглушка + подпись | Плейсхолдер "данные после 5 минут" | |
| Текст об ошибке | "Stratz unavailable" — честно но отвлекает | |

**User's choice:** Полностью скрыть  
**Notes:** Применяется к обоим фичам — win probability и counterpick раздел в тултипе.

---

## Polling Cadence

| Option | Description | Selected |
|--------|-------------|----------|
| 30s как in-game | Обновляется вместе с остальными данными матча | ✓ |
| 60s отдельно | Реже, отдельный хук, дополнительная защита rate limit | |

**User's choice:** 30s как in-game  
**Notes:** Серверный TTL 60s обеспечивает защиту от rate limit без усложнения клиентской логики.

---

## Claude's Discretion

- Отдельный endpoint vs bundled в match detail для win probability
- Exact Stratz GraphQL query shape (проверить в рантайме)
- Bar animation (CSS transition 500ms)
- raw fetch vs helper в stratzApi.ts

## Deferred Ideas

- Win probability sparkline (trend) — v2
- Patch-filtered counterpick data — v2
- Stratz player profiles enhancement — v2
