import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, legalActions } from "../engine/rules.js";
import { blankGame, setCell, putPirate, pirate } from "./helpers.js";

// Пират стоит на [1,6]; интересная клетка ставится на [2,6] прямо под ним.
function scene(cells) {
  const g = blankGame();
  for (const [at, cell] of cells) setCell(g, at, cell);
  const p = putPirate(g, 0, [1, 6]);
  return { g, p };
}

test("однонаправленная стрелка тащит пирата дальше без вопросов", () => {
  const { g, p } = scene([[[2, 6], { type: "arrow", dirs: [[1, 0]] }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.deepEqual(pirate(r.state, p.id).at, [3, 6]);
  assert.equal(r.state.pending, null);
});

test("многонаправленная стрелка спрашивает игрока", () => {
  const { g, p } = scene([[[2, 6], { type: "arrow", dirs: [[1, 0], [0, 1]] }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.equal(r.state.pending.kind, "arrow");
  assert.equal(r.state.pending.pirate, p.id);
  assert.equal(r.state.pending.options.length, 2);
  assert.deepEqual(pirate(r.state, p.id).at, [2, 6]);
});

test("ход не переходит сопернику, пока выбор не сделан", () => {
  const { g, p } = scene([[[2, 6], { type: "arrow", dirs: [[1, 0], [0, 1]] }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.activeTeam, 0);

  const after = applyAction(r.state, "A", { type: "choose", to: [3, 6] });
  assert.equal(after.ok, true);
  assert.deepEqual(pirate(after.state, p.id).at, [3, 6]);
  assert.equal(after.state.activeTeam, 1);
  assert.equal(after.state.pending, null);
});

test("соперник не может отвечать на чужой выбор", () => {
  const { g, p } = scene([[[2, 6], { type: "arrow", dirs: [[1, 0], [0, 1]] }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(applyAction(r.state, "B", { type: "choose", to: [3, 6] }).ok, false);
});

test("лёд повторяет прошлый ход и открывает обе клетки", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "ice" });
  setCell(g, [3, 6], { type: "empty" });
  const p = putPirate(g, 0, [1, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, [3, 6]);
  assert.equal(r.state.board[2][6].open, true, "сам лёд открывается");
  assert.equal(r.state.board[3][6].open, true, "и клетка, куда он выкинул");
});

test("лёд → крокодил → лёд: пирата возвращает туда, откуда он вышел", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "ice" });
  setCell(g, [3, 6], { type: "croc" });
  const p = putPirate(g, 0, [1, 6]);

  // Лёд гонит на юг к крокодилу, тот отшвыривает назад на лёд, лёд повторяет
  // уже этот ход — на север, в клетку, с которой пират начинал.
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, [1, 6]);
  assert.equal(pirate(r.state, p.id).dead, false);
});

test("лабиринт на пути обрывает скольжение", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "ice" });
  setCell(g, [3, 6], { type: "swamp", steps: 4 });
  const p = putPirate(g, 0, [1, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, [3, 6]);
  assert.equal(pirate(r.state, p.id).mazeLevel, 1);
});

test("лёд повторяет и диагональный ход", () => {
  const g = blankGame();
  setCell(g, [2, 7], { type: "ice" });
  const p = putPirate(g, 0, [1, 6]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 7] });
  assert.deepEqual(pirate(r.state, p.id).at, [3, 8]);
});

test("лёд повторяет ход ровно один раз и не проносит мимо клада", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "ice" });
  setCell(g, [3, 6], { type: "money", coins: 3 });
  const p = putPirate(g, 0, [1, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, [3, 6], "пират встаёт на клад, а не пролетает его");
  assert.equal(r.state.board[3][6].coins, 3);
});

test("если двойной ход уводит за поле, лёд протаскивает на одну клетку", () => {
  // С [1,5] на север двойной ход попал бы в [-1,5] — за пределы доски,
  // поэтому пират останавливается на одинарном шаге, в воде своего берега.
  const g = blankGame();
  setCell(g, [1, 5], { type: "ice" });
  const p = putPirate(g, 0, [2, 5]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [1, 5] });
  assert.deepEqual(pirate(r.state, p.id).at, [0, 5]);
  assert.equal(pirate(r.state, p.id).place, "sea");
  assert.equal(pirate(r.state, p.id).dead, false, "своя вода — не тонет");
});

test("крокодил возвращает пирата на клетку, откуда пришёл", () => {
  const { g, p } = scene([[[2, 6], { type: "croc" }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, [1, 6]);
});

test("цепочка стрелка → лёд разрешается за один ход", () => {
  const { g, p } = scene([
    [[2, 6], { type: "arrow", dirs: [[1, 0]] }],
    [[3, 6], { type: "ice" }],
  ]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  // Стрелка гонит на лёд, лёд повторяет тот же ход на юг.
  assert.deepEqual(pirate(r.state, p.id).at, [4, 6]);
  assert.equal(r.state.activeTeam, 1);
});

test("крокодил заново запускает клетку, на которую отогнал", () => {
  const g = blankGame();
  setCell(g, [5, 6], { type: "arrow", dirs: [[0, 1], [0, -1]], open: true });
  setCell(g, [5, 7], { type: "croc" });
  const p = putPirate(g, 0, [5, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [5, 7] });
  assert.deepEqual(pirate(r.state, p.id).at, [5, 6]);
  assert.ok(r.state.pending, "стрелка под пиратом обязана сработать ещё раз");
  assert.equal(r.state.pending.kind, "arrow");
});

test("одиночная стрелка, смотрящая на крокодила, — цикл и смерть", () => {
  const { g, p } = scene([
    [[2, 6], { type: "arrow", dirs: [[1, 0]] }],
    [[3, 6], { type: "croc" }],
  ]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.equal(pirate(r.state, p.id).dead, true, "бесконечный цикл убивает пирата");
  assert.equal(r.state.activeTeam, 1);
});

test("крокодил у самого берега возвращает пирата на корабль", () => {
  const g = blankGame();
  setCell(g, [1, 6], { type: "croc" });
  const p = g.pirates.find((x) => x.team === 0);

  const r = applyAction(g, "A", { type: "land", pirate: p.id, to: [1, 6] });
  assert.equal(r.ok, true);
  assert.equal(pirate(r.state, p.id).place, "ship", "не за борт, а обратно на палубу");
  assert.deepEqual(pirate(r.state, p.id).at, r.state.teams[0].ship);
  assert.equal(pirate(r.state, p.id).dead, false);
});

test("встречные стрелки — цикл: движок не виснет, пират гибнет", () => {
  const { g, p } = scene([
    [[2, 6], { type: "arrow", dirs: [[1, 0]] }],
    [[3, 6], { type: "arrow", dirs: [[-1, 0]] }],
  ]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.equal(pirate(r.state, p.id).dead, true);
  assert.equal(r.state.activeTeam, 1);
});

test("цепочка открывает все клетки, через которые протащило", () => {
  const { g, p } = scene([
    [[2, 6], { type: "arrow", dirs: [[1, 0]] }],
    [[3, 6], { type: "empty" }],
  ]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.board[2][6].open, true);
  assert.equal(r.state.board[3][6].open, true);
});

test("стоя на стрелке, пират уходит только по её направлениям", () => {
  // Пират оказался на стрелке «влево-вправо» — например, его вернул крокодил.
  const g = blankGame();
  setCell(g, [5, 6], { type: "arrow", dirs: [[0, 1], [0, -1]], open: true });
  const p = putPirate(g, 0, [5, 6]);

  const dirs = legalActions(g)
    .filter((a) => a.type === "move" && a.pirate === p.id)
    .map((a) => String([a.to[0] - 5, a.to[1] - 6]));

  assert.deepEqual([...new Set(dirs)].sort(), ["0,-1", "0,1"]);
});

test("с обычной клетки по-прежнему доступны все восемь направлений", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [5, 6]);
  const dirs = new Set(
    legalActions(g)
      .filter((a) => a.type === "move" && a.pirate === p.id)
      .map((a) => String([a.to[0] - 5, a.to[1] - 6])),
  );
  assert.equal(dirs.size, 8);
});
