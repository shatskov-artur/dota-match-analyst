# Sketch 002 — Match Page Layout Restructure

**Date:** 2026-05-15
**Status:** Awaiting review
**Design question:** Как разложить блоки match-page-а после того как Row 1 переезжает на `HeroPlayerGrid | ItemsBlock | CooldownsBlock` (три равных колонки)? Куда уходят Минимап, Roshan, Buildings, HistoryGraphs?

## Context

UAT-фидбэк 2026-05-15: текущее размещение `HeroPlayerGrid | ItemsBlock | (Map + Roshan + Cooldowns стопкой 320px)` не работает визуально — правая колонка перегружена и не выравнивается с левыми двумя.

**Зафиксированные решения (из чата):**
- Row 1 = `HeroPlayerGrid | ItemsBlock | CooldownsBlock`, все три `flex-1`, одинаковой высоты
- CooldownsBlock в Row 1 ширину делит поровну с другими (`flex-1`, не `320px`)
- Где разместить Map / Roshan / Buildings / HistoryGraphs — открытый вопрос (этот sketch)

## Variants

Все три варианта имеют одинаковый Row 1 (heroes | items | cooldowns). Различаются только Row 2 и далее.

| Variant | Row 2 | Row 3+ | Trade-off |
|---------|-------|--------|-----------|
| **A — Map · Roshan · Buildings** | DotaMapView \| RoshanBlock \| BuildingsSection | HistoryGraphs full-width | Все компактные «глянулные» блоки в одной строке. История получает полную ширину — графики читабельнее всего. Симметрично и предсказуемо. |
| **B — Map · Roshan · HistoryGraphs** | DotaMapView \| RoshanBlock \| HistoryGraphs | BuildingsSection full-width | История поднимается вверх (видна без скролла). Buildings — самый низкоприоритетный блок — уходит в низ полной шириной. |
| **C — Map · Roshan (2 cols); Buildings · HistoryGraphs (2 cols)** | DotaMapView \| RoshanBlock (50/50) | BuildingsSection \| HistoryGraphs (50/50) | Две пары по 2 колонки. Карта получает больше места (50% ширины), но история теряет ширину. |

## How to compare

```
file:///d:/MateProjects/projects/dota/dota_stats/.planning/sketches/002-match-page-layout/002-A-map-roshan-buildings.html
file:///d:/MateProjects/projects/dota/dota_stats/.planning/sketches/002-match-page-layout/002-B-map-roshan-history.html
file:///d:/MateProjects/projects/dota/dota_stats/.planning/sketches/002-match-page-layout/002-C-map-roshan-buildings-history-stacked.html
```

## What to look for

- **Row 2 равные высоты:** все три блока во второй строке смотрятся как «комплект» или один доминирует?
- **HistoryGraphs ширина:** в A и B-варианте — узкие колонки vs полная ширина. Где графики лучше читаются?
- **Buildings приоритет:** этот блок — самый редко смотришь? Если да, его место внизу (B), если нет — сверху (A).
- **Скролл:** какая структура помещается в один экран на 1440×900 без скролла?
- **Минимап квадратность:** во всех трёх он флекс-1 ширины и `aspect-square` — карта получится 400–500px при 3 колонках, 700+ при 2 (вариант C).

## Winner

_TBD_

## Decisions captured

_Заполняется на `/gsd-sketch-wrap-up`_

## Tags

`#layout` `#match-page` `#phase-10.3` `#row-restructure`
