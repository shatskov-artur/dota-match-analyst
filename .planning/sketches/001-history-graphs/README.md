# Sketch 001 — HistoryGraphs (Dota-style)

**Date:** 2026-05-14
**Status:** Awaiting review
**Design question:** Как переделать HistoryGraphs в Dota-overlay стиль — Radiant ↑ зелёный / Dire ↓ красный через ось 0, чтобы преимущество и его динамика читались мгновенно?

## Context

Текущая реализация ([HistoryGraphs.tsx](../../../client/src/components/HistoryGraphs.tsx)) рендерит два стопкой SVG с симметричной осью Y, но без визуальной асимметрии Radiant↑/Dire↓ — по факту это просто линия от нуля с заливкой над и под ней одинаковой плотности. Пользовательский фидбек: «непонятно кто кого превосходит и насколько».

Дополнительная задача (отдельный фикс, не sketch-вопрос): XP-график показывает `0.0k` плоско — это баг в `buildSample` (вероятно `xpm` отсутствует в Valve payload для текущего патча).

## Variants

| Variant | Подход | Ключевая визуальная идея | Hover/interactivity |
|---------|--------|-------------------------|---------------------|
| **A — Broadcast canonical** | Две стопкой секции, плотная заливка alpha 0.55, симметричная Y per region | «Как Twitch overlay» — толстые цветные блоки, прямые линии-границы | Hover: вертикальная линия + tooltip с временем и значением |
| **B — Gradient intensity** | Та же структура, но заливка с вертикальным градиентом (alpha 0.05 у нуля → 0.85 у пика) | Большое преимущество «гуще» и темнее — интуитивно ощущается размер | Hover как в A |
| **C — Line + soft fill + static labels** | Тонкая граница (stroke 2px) + слабая заливка (alpha 0.15) + статические подписи на peak Radiant и peak Dire | Спокойный, читается без мыши — все ключевые числа уже на графике | Нет hover — никаких интеракций |

## How to compare

Открыть все три HTML-файла в браузере на одних и тех же mock-данных (20 мин матча, Radiant ведёт → Dire переламывает → Radiant возвращает):

```
file:///d:/MateProjects/projects/dota/dota_stats/.planning/sketches/001-history-graphs/001-A-broadcast-canonical.html
file:///d:/MateProjects/projects/dota/dota_stats/.planning/sketches/001-history-graphs/001-B-gradient-intensity.html
file:///d:/MateProjects/projects/dota/dota_stats/.planning/sketches/001-history-graphs/001-C-line-soft-fill.html
```

## What to look for

- **A vs B:** градиент помогает считывать размер преимущества или просто шумит?
- **A vs C:** нужен ли hover, или статических peak-меток достаточно? (важно — если hover нужен, то цена интерактивности)
- **B vs C:** дотовский overlay-look vs спокойный «info-block» — что лучше ложится на тёмный фон сайта?
- **Все три:** читается ли разворот в 14-й минуте сразу, без всматривания?
- **Все три:** на мобильном (≤768px) что-то ломается?

## Winner

_TBD — после ревью пользователем_

## Decisions captured

_Заполняется на `/gsd-sketch-wrap-up`_

## Tags

`#chart` `#data-viz` `#dota-overlay` `#match-page` `#phase-10.2`
