# Phase 8: Ability Cooldowns & Map - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 08-ability-cooldowns-map
**Areas discussed:** Герои на карте, Блок Cooldowns, Иконки ультимейтов

---

## Герои на карте

| Option | Description | Selected |
|--------|-------------|----------|
| Цветные кружки + портрет | ~16px circle with hero portrait inside, Radiant green border / Dire red border | ✓ |
| Цветные точки (без портрета) | Larger dots in team color, same Dot-component pattern as buildings | |
| Точки + инициалы героя | Colored circle with 2-char hero abbreviation inside | |

**User's choice:** Colored circles with portrait inside (Recommended)
**Notes:** Visually identifiable; needs 10 `<image>` elements in SVG.

---

## Блок Cooldowns — расположение

| Option | Description | Selected |
|--------|-------------|----------|
| Рядом с картой | CooldownsBlock to the left of DotaMapView in the same row as map+buildings | |
| Отдельная секция ниже | CooldownsBlock as standalone section below ItemsBlock, full width | |
| Справа от ItemsBlock | CooldownsBlock as third column in the items row | |
| Фри-форм ответ | User described custom layout | ✓ |

**User's choice:** Map moves to the right of ItemsBlock. CooldownsBlock goes below the map. Both sized to match the left-column blocks (HeroPlayerGrid + ItemsBlock) so they visually align.
**Notes:** Restructure MatchPage bottom into two columns: left = HeroPlayerGrid+ItemsBlock, right = DotaMapView+CooldownsBlock.

---

## Иконки ультимейтов

| Option | Description | Selected |
|--------|-------------|----------|
| Портрет + иконка ульты | hero portrait (32px) + ability icon (32px) + seconds + state label | ✓ |
| Только портрет + время | hero portrait (32px) + seconds, no ability icon | |

**User's choice:** Portrait + ultimate icon (Recommended)
**Notes:** Requires `shared/heroUltimates.json` mapping hero_id → ultimate ability name for CDN URL.

---

## Claude's Discretion

- Coordinate normalization formula for x_pos/y_pos → SVG space (verify range at runtime)
- Whether `<clipPath>` + `<image>` or alternative approach for portrait circles in SVG
- CooldownsBlock header label ("Cooldowns" vs "Ultimates")
- BuildingsSection placement in new two-column layout
- Handling of `ultimate_state === 0` (dead hero) in cooldowns list
- Pixel sizing to equalize left/right column heights

## Deferred Ideas

- Regular ability cooldowns — not in live API
- Cooldown tooltip on ability icon — deferred to v2
- Dead hero indicator styling on minimap
