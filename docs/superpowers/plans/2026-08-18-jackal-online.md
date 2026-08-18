# Шакал онлайн — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Играбельная онлайн-версия «Шакала» на двоих через WebSocket-сервер с полными правилами.

**Architecture:** Сервер — единственный источник правды. Чистый движок правил на ESM-JavaScript исполняется и в Node (тесты), и в Deno (продакшен). Клиент шлёт намерения, получает урезанное состояние без закрытых клеток.

**Tech Stack:** ESM-JavaScript без сборки, `node --test` для тестов, Deno + `Deno.serve` для сервера, CSS-grid + эмодзи для клиента.

**Spec:** `docs/superpowers/specs/2026-08-18-jackal-online-design.md`

## Global Constraints

- Чистый ESM-JavaScript, без TypeScript, без сборки, без npm-зависимостей.
- `engine/` не имеет права импортировать что-либо из Deno или Node — только чистый JS.
- Поле 13×13, остров 117 клеток, 37 монет в 16 клетках.
- 4 команды: 0=N, 1=W, 2=S, 3=E. Игрок A владеет 0 и 2, игрок B — 1 и 3.
- Очередь ходов циклическая 0→1→2→3→0.
- Рандом только через сид-генератор из `engine/random.js`, никакого `Math.random()` в движке.
- Тесты запускаются `node --test test/`.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `engine/random.js` | Детерминированный ГПСЧ по сиду (mulberry32) + `shuffle` |
| `engine/tiles.js` | Каталог типов клеток и состав колоды из 117 штук |
| `engine/board.js` | Геометрия поля 13×13, море/остров/берега, раскладка колоды |
| `engine/state.js` | Создание начального состояния: команды, корабли, пираты |
| `engine/moves.js` | Перечисление легальных действий для активной команды |
| `engine/effects.js` | Эффекты клеток и разрешение цепочек |
| `engine/rules.js` | `applyAction` — единая точка входа, валидация, победа |
| `engine/view.js` | `redact(state, player)` — вырезает закрытые клетки |
| `server.js` | Deno: статика, WebSocket-комнаты, слоты игроков, реконнект |
| `web/index.html` | Разметка и стили сетки |
| `web/app.js` | Рендер, клики, подсветка, лог |
| `test/*.test.js` | Тесты по одному файлу на модуль движка |

---

### Task 1: Детерминированный рандом и колода клеток

**Files:**
- Create: `engine/random.js`, `engine/tiles.js`
- Test: `test/tiles.test.js`

**Interfaces:**
- Produces: `makeRng(seed) → () => number` (0..1), `shuffle(rng, array) → array` (новый массив).
- Produces: `TILE_TYPES` — объект-каталог, `buildDeck() → Tile[]` длиной 117.
- Tile: `{type: string, dirs?: number[][], coins?: number, steps?: number}`.

- [ ] **Step 1: Написать падающий тест состава колоды**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeck } from "../engine/tiles.js";

test("колода состоит ровно из 117 клеток", () => {
  assert.equal(buildDeck().length, 117);
});

test("состав колоды совпадает со спекой", () => {
  const counts = {};
  for (const t of buildDeck()) counts[t.type] = (counts[t.type] ?? 0) + 1;
  assert.equal(counts.empty, 40);
  assert.equal(counts.arrow, 21);
  assert.equal(counts.money, 16);
  assert.equal(counts.ice, 6);
  assert.equal(counts.croc, 4);
  assert.equal(counts.rum, 4);
  assert.equal(counts.trap, 3);
  assert.equal(counts.knight, 2);
  assert.equal(counts.cannon, 2);
  assert.equal(counts.fort, 2);
  assert.equal(counts.balloon, 2);
  assert.equal(counts.fortNative, 1);
  assert.equal(counts.cannibal, 1);
  assert.equal(counts.plane, 1);
  assert.equal(counts.jungle, 5);
  assert.equal(counts.desert, 4);
  assert.equal(counts.swamp, 2);
  assert.equal(counts.mountain, 1);
});

test("на поле ровно 37 монет", () => {
  const total = buildDeck()
    .filter((t) => t.type === "money")
    .reduce((s, t) => s + t.coins, 0);
  assert.equal(total, 37);
});

test("у каждой стрелки есть непустой список направлений", () => {
  for (const t of buildDeck().filter((t) => t.type === "arrow")) {
    assert.ok(t.dirs.length > 0);
    for (const [dr, dc] of t.dirs) assert.ok(Math.abs(dr) <= 1 && Math.abs(dc) <= 1);
  }
});
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `node --test test/tiles.test.js`
Expected: FAIL — модуль `engine/tiles.js` не найден.

- [ ] **Step 3: Реализовать `engine/random.js`**

```js
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(rng, array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Реализовать `engine/tiles.js`**

Колода собирается повторением: 40 `empty`, 16 `money` с распределением монет
`[1,1,1,1,1,2,2,2,2,2,3,3,3,4,4,5]`, вертушки с полем `steps`
(jungle 2, desert 3, swamp 4, mountain 5), и 21 стрелка пятью формами:
4 одиночных диагональных, 4 двойных противоположных прямых, 4 двойных смежных
диагональных, 4 четверных прямых, 5 четверных диагональных. Каждая форма
получает `dirs` — массив пар `[dr, dc]`.

- [ ] **Step 5: Прогнать тесты**

Run: `node --test test/tiles.test.js`
Expected: PASS, 4 теста.

- [ ] **Step 6: Коммит**

```bash
git add engine/random.js engine/tiles.js test/tiles.test.js
git commit -m "Колода из 117 клеток и сид-рандом"
```

---

### Task 2: Геометрия поля и раскладка

**Files:**
- Create: `engine/board.js`
- Test: `test/board.test.js`

**Interfaces:**
- Consumes: `buildDeck`, `makeRng`, `shuffle`.
- Produces: `SIZE = 13`, `isIsland(r,c) → bool`, `isSea(r,c) → bool`,
  `SHORES` — массив из 4 объектов `{team, cells: [[r,c],...], start: [r,c]}`
  в порядке N, W, S, E.
- Produces: `createBoard(seed) → Cell[][]`, где Cell —
  `{type, open: false, ...}` для острова и `{type: "sea", open: true}` для моря.

- [ ] **Step 1: Написать падающий тест**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, isIsland, SHORES, createBoard } from "../engine/board.js";

test("остров — 117 клеток", () => {
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (isIsland(r, c)) n++;
  assert.equal(n, 117);
});

test("углы острова вырезаны", () => {
  for (const [r, c] of [[1, 1], [1, 11], [11, 1], [11, 11]]) {
    assert.equal(isIsland(r, c), false);
  }
});

test("у каждого берега 9 позиций корабля, старт в середине", () => {
  assert.equal(SHORES.length, 4);
  for (const s of SHORES) {
    assert.equal(s.cells.length, 9);
    assert.deepEqual(s.start, s.cells[4]);
  }
});

test("берега идут в порядке N, W, S, E", () => {
  assert.deepEqual(SHORES.map((s) => s.start), [[0, 6], [6, 0], [12, 6], [6, 12]]);
});

test("раскладка детерминирована по сиду и покрывает остров", () => {
  const a = createBoard(42);
  const b = createBoard(42);
  const c = createBoard(43);
  let islandCells = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let col = 0; col < SIZE; col++) {
      if (isIsland(r, col)) {
        islandCells++;
        assert.equal(a[r][col].open, false);
        assert.notEqual(a[r][col].type, "sea");
      } else {
        assert.equal(a[r][col].type, "sea");
      }
    }
  }
  assert.equal(islandCells, 117);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/board.test.js`
Expected: FAIL — нет `engine/board.js`.

- [ ] **Step 3: Реализовать `engine/board.js`**

`isIsland(r,c)` истинно при `1 <= r,c <= 11` минус четыре угла.
Море — всё остальное в пределах 13×13.
Берега: N — `row 0, cols 2..10`; W — `col 0, rows 2..10`; S — `row 12, cols 2..10`;
E — `col 12, rows 2..10`. `createBoard` тасует колоду и раскладывает по островным
клеткам в порядке обхода.

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/board.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/board.js test/board.test.js
git commit -m "Геометрия поля 13x13 и детерминированная раскладка"
```

---

### Task 3: Начальное состояние партии

**Files:**
- Create: `engine/state.js`
- Test: `test/state.test.js`

**Interfaces:**
- Produces: `createGame(seed) → State`.
- State: `{seed, phase: "playing", activeTeam: 0, board, teams, pirates, pending: null, planeUsed: false, log: []}`.
- Team: `{id, owner: "A"|"B", shore: "N"|"W"|"S"|"E", ship: [r,c], delivered: 0}`.
- Pirate: `{id, team, at: [r,c], place: "ship"|"land"|"sea", coin: false, skipTurns: 0, trapped: false, dead: false, cameFrom: null, spinnerLeft: 0}`.
- Produces: `ownerOfTeam(teamId) → "A"|"B"`.

- [ ] **Step 1: Написать падающий тест**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, ownerOfTeam } from "../engine/state.js";

test("4 команды, по 3 пирата, всего 12", () => {
  const g = createGame(1);
  assert.equal(g.teams.length, 4);
  assert.equal(g.pirates.length, 12);
  for (let t = 0; t < 4; t++) {
    assert.equal(g.pirates.filter((p) => p.team === t).length, 3);
  }
});

test("владельцы: A держит противоположные берега N и S", () => {
  assert.equal(ownerOfTeam(0), "A");
  assert.equal(ownerOfTeam(2), "A");
  assert.equal(ownerOfTeam(1), "B");
  assert.equal(ownerOfTeam(3), "B");
});

test("все пираты стартуют на своём корабле", () => {
  const g = createGame(1);
  for (const p of g.pirates) {
    assert.equal(p.place, "ship");
    assert.deepEqual(p.at, g.teams[p.team].ship);
  }
});

test("партия начинается с команды N", () => {
  assert.equal(createGame(1).activeTeam, 0);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/state.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать `engine/state.js`**

`ownerOfTeam` возвращает `"A"` для чётных id, `"B"` для нечётных — это и есть
правило чёт/нечёт, дающее чередование людей при обходе 0→1→2→3.

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/state.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/state.js test/state.test.js
git commit -m "Начальное состояние: 4 команды по 3 пирата"
```

---

### Task 4: Ход корабля и высадка

**Files:**
- Create: `engine/moves.js`, `engine/rules.js`
- Test: `test/ship.test.js`

**Interfaces:**
- Produces: `legalActions(state) → Action[]` для активной команды.
- Action: `{type: "ship", to: [r,c]}` | `{type: "land", pirate: id, to: [r,c]}` | `{type: "move", pirate: id, to: [r,c]}` | `{type: "choose", to: [r,c]}`.
- Produces: `applyAction(state, player, action) → {ok: true, state, events} | {ok: false, reason}`.
- Ход передаётся следующей команде только когда `pending === null`.

- [ ] **Step 1: Написать падающий тест**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../engine/state.js";
import { applyAction, legalActions } from "../engine/rules.js";

test("корабль ходит на 1 клетку вдоль своего берега", () => {
  const g = createGame(7);
  const r = applyAction(g, "A", { type: "ship", to: [0, 7] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.teams[0].ship, [0, 7]);
  assert.equal(r.state.activeTeam, 1);
});

test("корабль не может уйти с берега или прыгнуть через клетку", () => {
  const g = createGame(7);
  assert.equal(applyAction(g, "A", { type: "ship", to: [1, 6] }).ok, false);
  assert.equal(applyAction(g, "A", { type: "ship", to: [0, 8] }).ok, false);
  assert.equal(applyAction(g, "A", { type: "ship", to: [0, 1] }).ok, false);
});

test("чужой игрок и чужая команда ходить не могут", () => {
  const g = createGame(7);
  assert.equal(applyAction(g, "B", { type: "ship", to: [0, 7] }).ok, false);
});

test("высадка ставит пирата на берег и открывает клетку", () => {
  const g = createGame(7);
  const p = g.pirates.find((x) => x.team === 0);
  const r = applyAction(g, "A", { type: "land", pirate: p.id, to: [1, 6] });
  assert.equal(r.ok, true);
  const moved = r.state.pirates.find((x) => x.id === p.id);
  assert.equal(moved.place, "land");
  assert.equal(r.state.board[1][6].open, true);
});

test("legalActions предлагает только ходы активной команды", () => {
  const g = createGame(7);
  for (const a of legalActions(g)) {
    if (a.type !== "ship") {
      assert.equal(g.pirates.find((p) => p.id === a.pirate).team, 0);
    }
  }
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/ship.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать движение корабля и высадку**

`applyAction` проверяет: партия идёт, `player === ownerOfTeam(state.activeTeam)`,
нет незакрытого `pending`, действие есть в `legalActions`. Состояние
клонируется структурно, мутируется копия. Высадка допустима на островные клетки
из 8-окрестности корабля.

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/ship.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/moves.js engine/rules.js test/ship.test.js
git commit -m "Ход корабля, высадка, валидация очереди"
```

---

### Task 5: Шаг пирата, открытие клетки, деньги

**Files:**
- Create: `engine/effects.js`
- Modify: `engine/rules.js`
- Test: `test/move.test.js`

**Interfaces:**
- Produces: `resolve(state, pirateId, from) → events` — применяет эффект клетки,
  на которой стоит пират, и продолжает цепочку до состояния покоя либо до
  выставления `state.pending`.
- Pending: `{pirate, kind: "arrow"|"knight"|"plane", options: [[r,c],...]}`.

- [ ] **Step 1: Написать падающий тест**

Тест строит поле вручную: `createGame(1)`, затем подменяет `board[r][c]` на
нужный тип, ставит пирата рядом и делает ход. Проверяется, что пустая клетка
не двигает пирата, а денежная выкладывает монеты.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../engine/state.js";
import { applyAction } from "../engine/rules.js";

function gameWith(cell, at) {
  const g = createGame(1);
  g.board[at[0]][at[1]] = { open: false, ...cell };
  const p = g.pirates.find((x) => x.team === 0);
  p.place = "land";
  p.at = [1, 6];
  g.board[1][6] = { type: "empty", open: true };
  return { g, p };
}

test("пустая клетка оставляет пирата на месте", () => {
  const { g, p } = gameWith({ type: "empty" }, [2, 6]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.pirates.find((x) => x.id === p.id).at, [2, 6]);
});

test("денежная клетка выкладывает монеты при открытии", () => {
  const { g, p } = gameWith({ type: "money", coins: 3 }, [2, 6]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.board[2][6].coins, 3);
  assert.equal(r.state.board[2][6].open, true);
});

test("пират ходит только на соседнюю клетку", () => {
  const { g, p } = gameWith({ type: "empty" }, [4, 6]);
  assert.equal(applyAction(g, "A", { type: "move", pirate: p.id, to: [4, 6] }).ok, false);
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/move.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать шаг, открытие и деньги**

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/move.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/effects.js engine/rules.js test/move.test.js
git commit -m "Шаг пирата, открытие клеток, выкладка монет"
```

---

### Task 6: Стрелки, лёд, крокодил и цепочки

**Files:**
- Modify: `engine/effects.js`
- Test: `test/chains.test.js`

**Interfaces:**
- Consumes: `resolve`, pending-механизм из Task 5.
- Стрелка с одним направлением разрешается сразу; с несколькими — выставляет
  `pending {kind: "arrow"}`, и игрок присылает `{type: "choose", to}`.

- [ ] **Step 1: Написать падающий тест**

```js
test("однонаправленная стрелка тащит пирата дальше", ...);
test("многонаправленная стрелка требует выбора через pending", ...);
test("лёд проносит пирата ещё на клетку в том же направлении", ...);
test("крокодил возвращает пирата на клетку, откуда пришёл", ...);
test("цепочка стрелка → лёд → крокодил разрешается за один ход", ...);
test("ход не переходит сопернику, пока pending не закрыт", ...);
```

Каждый тест собирает поле вручную, как в Task 5, и проверяет конечную позицию
пирата и значение `state.activeTeam`.

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/chains.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать стрелки, лёд, крокодила**

Цепочка ограничивается счётчиком шагов (защита от зацикливания стрелка↔стрелка):
не более 32 переходов за ход, дальше пират останавливается.

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/chains.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/effects.js test/chains.test.js
git commit -m "Стрелки, лёд, крокодил и разрешение цепочек"
```

---

### Task 7: Задерживающие клетки — вертушки, ром, капкан

**Files:**
- Modify: `engine/effects.js`, `engine/moves.js`
- Test: `test/delay.test.js`

**Interfaces:**
- Вертушка ставит `pirate.spinnerLeft = steps - 1`; пока он > 0, единственный
  легальный ход этим пиратом — «остаться», уменьшающий счётчик.
- Ром ставит `pirate.skipTurns = 1`; пират исключается из `legalActions`,
  пока счётчик не отработает.
- Капкан ставит `pirate.trapped = true`; снимается приходом другого пирата
  своей команды на ту же клетку.

- [ ] **Step 1: Написать падающий тест**

```js
test("джунгли держат пирата 2 хода", ...);
test("болото держит пирата 4 хода", ...);
test("ром заставляет пропустить один ход этим пиратом", ...);
test("другие пираты команды ходят, пока один пьёт ром", ...);
test("капкан держит пирата до прихода товарища", ...);
test("чужой пират не освобождает из капкана", ...);
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/delay.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать задержки**

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/delay.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/effects.js engine/moves.js test/delay.test.js
git commit -m "Вертушки, ром и капкан"
```

---

### Task 8: Транспортные и смертельные клетки

**Files:**
- Modify: `engine/effects.js`
- Test: `test/special.test.js`

**Interfaces:**
- Конь и самолёт выставляют `pending` со списком клеток-вариантов.
- Самолёт ставит `state.planeUsed = true`; повторно не срабатывает.
- Шар телепортирует на корабль своей команды, `place = "ship"`.
- Пушка выбрасывает по прямой от центра поля до края; если конечная клетка
  морская — `place = "sea"`.
- Людоед: `pirate.dead = true`, монета остаётся на клетке.
- Крепость и крепость с туземкой помечают клетку как убежище; туземка
  воскрешает одного мёртвого пирата команды за ход.

- [ ] **Step 1: Написать падающий тест**

```js
test("конь предлагает ходы буквой Г и переносит на выбранный", ...);
test("шар возвращает пирата на корабль своей команды", ...);
test("самолёт срабатывает один раз за партию", ...);
test("пушка выбрасывает пирата в море по прямой", ...);
test("людоед убивает пирата, монета остаётся на клетке", ...);
test("туземка воскрешает погибшего пирата команды", ...);
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/special.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать спецклетки**

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/special.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/effects.js test/special.test.js
git commit -m "Конь, шар, самолёт, пушка, людоед, крепости"
```

---

### Task 9: Бой

**Files:**
- Modify: `engine/rules.js`, `engine/effects.js`
- Test: `test/combat.test.js`

**Interfaces:**
- Приход на клетку с вражеским пиратом отправляет того на корабль его команды,
  его монета остаётся на клетке.
- Пираты в крепости неуязвимы.
- Пираты одного владельца (`ownerOfTeam` совпадает) друг друга не бьют — такой
  ход нелегален, если клетка занята своим.
- Пират с монетой не может входить на клетку с врагом.

- [ ] **Step 1: Написать падающий тест**

```js
test("приход на клетку врага отправляет его на корабль", ...);
test("монета побеждённого остаётся на клетке", ...);
test("пирата в крепости выбить нельзя", ...);
test("свои команды одного игрока не бьют друг друга", ...);
test("пират с монетой не может атаковать", ...);
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/combat.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать бой**

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/combat.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/rules.js engine/effects.js test/combat.test.js
git commit -m "Бой, крепости, запрет боя с монетой"
```

---

### Task 10: Золото и победа

**Files:**
- Modify: `engine/rules.js`, `engine/moves.js`
- Test: `test/gold.test.js`

**Interfaces:**
- Действие `{type: "move", pirate, to, takeCoin: bool, dropCoin: bool}` — подъём
  и выкладывание монеты совмещены с шагом.
- Пират с монетой не может ходить на закрытую клетку.
- Монету можно класть только на стационарные клетки: `empty`, `money`, `fort`,
  `fortNative`, `cannibal`.
- Доставка: шаг с монетой с прибрежной клетки на клетку своего корабля
  увеличивает `delivered` команды.
- Produces: `scoreOf(state, owner) → number` — сумма `delivered` обеих команд.
- Победа: `scoreOf >= 19` завершает партию; иначе при отсутствии монет на острове
  и на руках — побеждает больший счёт.

- [ ] **Step 1: Написать падающий тест**

```js
test("пират поднимает монету с клетки", ...);
test("пират с монетой не может открывать закрытые клетки", ...);
test("монету нельзя класть на стрелку", ...);
test("доставка на свой корабль увеличивает счёт", ...);
test("монеты обеих команд игрока суммируются", ...);
test("19 монет завершают партию победой", ...);
test("пират с монетой в море теряет её", ...);
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/gold.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать золото и победу**

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/gold.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/rules.js engine/moves.js test/gold.test.js
git commit -m "Перенос золота, доставка на корабль, условие победы"
```

---

### Task 11: Урезание состояния для клиента

**Files:**
- Create: `engine/view.js`
- Test: `test/view.test.js`

**Interfaces:**
- Produces: `redact(state, owner) → ViewState` — закрытые клетки заменяются на
  `{open: false}` без поля `type`; `seed` вырезается целиком.
- В `ViewState` добавляется `you: owner`, `yourTurn: bool` и `legal: Action[]`
  (пустой, если сейчас не ход этого игрока).

- [ ] **Step 1: Написать падающий тест**

```js
test("закрытые клетки не раскрывают тип", ...);
test("сид не утекает клиенту", ...);
test("открытые клетки видны полностью", ...);
test("legal пуст, когда сейчас не твой ход", ...);
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/view.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать `redact`**

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/view.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/view.js test/view.test.js
git commit -m "Урезание состояния: закрытые клетки и сид не уходят клиенту"
```

---

### Task 12: WebSocket-сервер и комнаты

**Files:**
- Create: `server.js`, `deno.json`
- Test: `test/room.test.js`

**Interfaces:**
- Create: `engine/room.js` — чистая логика комнаты без сети:
  `createRoom(code, seed) → Room`, `joinRoom(room, sessionId) → {owner}|{error}`,
  `handleMessage(room, owner, msg) → {broadcast}|{error}`.
- Сервер — тонкая обвязка: `Deno.serve` раздаёт `web/`, апгрейдит `/ws?room=CODE`,
  зовёт `engine/room.js`, рассылает `redact` каждому по его владельцу.
- Слот закрепляется за `sessionId` из localStorage — реконнект возвращает свой цвет.

- [ ] **Step 1: Написать падающий тест на логику комнаты**

```js
test("первые двое получают слоты A и B", ...);
test("третий подключившийся становится зрителем", ...);
test("реконнект по тому же sessionId возвращает прежний слот", ...);
test("сообщение не своего игрока отклоняется", ...);
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `node --test test/room.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать `engine/room.js`, затем `server.js` и `deno.json`**

`deno.json` задаёт задачу `dev`: `deno run -A server.js`.

- [ ] **Step 4: Прогнать тесты**

Run: `node --test test/room.test.js`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add engine/room.js server.js deno.json test/room.test.js
git commit -m "Комнаты, слоты игроков, реконнект и WebSocket-сервер"
```

---

### Task 13: Веб-клиент

**Files:**
- Create: `web/index.html`, `web/app.js`

**Interfaces:**
- Consumes: `ViewState` из Task 11 по WebSocket.
- Экран входа: поле «код комнаты» и кнопка. Код в адресной строке — сразу вход.
- Рендер: CSS-grid 13×13, эмодзи по типу клетки, закрытые — тёмная рубашка.
- Клик по своему пирату подсвечивает клетки из `legal`; клик по подсвеченной
  шлёт действие. Pending-выбор подсвечивается другим цветом.
- Панель: счёт обоих игроков, чей ход, лог последних событий.

- [ ] **Step 1: Написать `web/index.html` со стилями сетки**

- [ ] **Step 2: Написать `web/app.js` — подключение, рендер, клики**

- [ ] **Step 3: Проверить вручную**

Run: `deno task dev`, открыть две вкладки на один код комнаты, сыграть
несколько ходов: высадка, открытие клеток, подъём монеты, доставка.

- [ ] **Step 4: Коммит**

```bash
git add web/index.html web/app.js
git commit -m "Веб-клиент: сетка, подсветка ходов, счёт и лог"
```

---

### Task 14: Деплой

**Files:**
- Create: `README.md`

- [ ] **Step 1: Написать README** — как запустить локально и как задеплоить.

- [ ] **Step 2: Проверить, что все тесты зелёные**

Run: `node --test test/`
Expected: PASS, все файлы.

- [ ] **Step 3: Коммит и деплой**

```bash
git add README.md
git commit -m "README с инструкцией запуска и деплоя"
deno deploy
```

Деплой требует аккаунта владельца — выполняется человеком после логина
через GitHub.
