# Phase 10: Historical Graphs - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 10-historical-graphs
**Areas discussed:** Chart-библиотека + layout, Аккумулятор в Redis, Источник XP, UX детали

---

## Chart-библиотека + layout

### Q: Чем рендерим графики?

| Option | Description | Selected |
|--------|-------------|----------|
| Кастомный SVG (Recommended) | Совпадает с паттерном DotaMapView/WinProbBar; bundle 0КБ лишнего; полный контроль стиля | ✓ |
| recharts | Declarative React-либ ~90KB gzipped; быстрее писать, но +dependency | |
| uPlot / lightweight-charts | Imperative canvas; оверкил для 120 точек | |

**User's choice:** Кастомный SVG

### Q: Как расположить gold и xp графики?

| Option | Description | Selected |
|--------|-------------|----------|
| Два стэкнутых графика (Recommended) | Gold сверху, XP снизу; общая X-ось, независимые Y | ✓ |
| Один совмещённый | Двойная Y-ось — gold ~50k vs xp ~30k разные масштабы | |
| Табы | Экономит место, теряет сравнение | |

**User's choice:** Два стэкнутых графика

### Q: Как рисовать diff по Y?

| Option | Description | Selected |
|--------|-------------|----------|
| Симметрично вокруг 0 с заливкой (Recommended) | Radiant↑ зелёный, Dire↓ красный, area-fill | ✓ |
| Абсолютная линия | Одна линия со знаком, без заливки | |
| Stacked-area по командам | Две линии Radiant/Dire отдельно | |

**User's choice:** Симметрично вокруг 0 с заливкой

---

## Аккумулятор в Redis

### Q: Как сервер семплит точки?

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy piggyback (Recommended) | Семпл пишется в обработчике /api/live/games после парсинга Valve, с throttle ≥5с по match_id; ноль фоновых процессов | ✓ |
| Глобальный 30с job | setInterval на бэке всегда пуллит — лишние upstream calls и сложно для Railway | |
| Per-match interval | Старт/стоп по match_id; не выживает рестарт | |

**User's choice:** Lazy piggyback

### Q: Форма хранения серии в Redis?

| Option | Description | Selected |
|--------|-------------|----------|
| Redis list, RPUSH/LRANGE (Recommended) | Ключ timeseries:{match_id}; LTRIM 0 -240; EXPIRE 7200 | ✓ |
| Sorted set по timestamp | ZADD score=ts; оверкил | |
| JSON blob, GET/SET | RMW race condition риск | |

**User's choice:** Redis list, RPUSH/LRANGE

### Q: Как очищаем данные после игры?

| Option | Description | Selected |
|--------|-------------|----------|
| TTL 2ч + DEL на game_state===6 (Recommended) | Belt-and-suspenders: явный DEL на конец, TTL как safety net | ✓ |
| Только TTL | Данные живут 2ч после конца | |
| Только явный DEL | Leak risk если game_state===6 не увиден | |

**User's choice:** TTL 2ч + DEL на game_state===6

---

## Источник XP

### Q: Откуда берём team-XP для xp diff?

| Option | Description | Selected |
|--------|-------------|----------|
| Σ(xpm × duration/60) (Recommended) | Аппроксимация по xpm; помечаем "примерная XP разница" | ✓ |
| Проверить runtime-payload и добавить .level/total_xp если есть | Researcher верифицирует точный источник | |
| Net_worth proxy | Графики дублируют gold | |
| Отказаться от XP-графика | Отход от ROADMAP scope | |

**User's choice:** Σ(xpm × duration/60)

---

## UX детали

### Q: Интерактивность графиков?

| Option | Description | Selected |
|--------|-------------|----------|
| Hover-tooltip с точными значениями (Recommended) | Crosshair + блок "MM:SS — Radiant +X.Xk gold, +X.Xk xp"; паттерн IntelTooltip | ✓ |
| Статичный chart | Только линия и оси | |
| Last-point лейбл | Лок-он лейбл с текущими diff у правой границы | |

**User's choice:** Hover-tooltip с точными значениями

### Q: Что показываем первые 30–60с пока история пуста?

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton + текст (Recommended) | "Накапливаем историю… ({elapsed}/30с)"; нет CLS | ✓ |
| Скрыть блок | Появляется при ≥2 точках; CLS | |
| Одна точка + флэт линия | Вводит в заблуждение | |

**User's choice:** Skeleton + текст

### Q: Как клиент берёт свежие точки?

| Option | Description | Selected |
|--------|-------------|----------|
| Пиггибэк на useMatchDetail (Recommended) | history включается в /api/match/:id ответ; ноль новых хуков, polling сам стопится на game_state===6 | ✓ |
| Отдельный endpoint /api/match/:id/history | Отдельный useQuery + refetchInterval 30с; риск рассинхрона | |

**User's choice:** Пиггибэк на useMatchDetail

---

## Claude's Discretion

- Точные размеры/паддинги/гридлайны/типографика осей.
- Алгоритм позиционирования tooltip (clamp в viewport, edge handling).
- Порог `duration > 60` в условиях семплера.

## Deferred Ideas

- Точный team-XP из `player.level`/`scoreboard.radiant.xp` (зависит от runtime-payload).
- Min/max аннотации на линии (peak lead).
- Сохранение истории за пределами матча для пост-мортема.
- Background сэмплер для матчей без зрителей.
- Touch gesture handling (long-press, pinch).
