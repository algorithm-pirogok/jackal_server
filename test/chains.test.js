import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../engine/rules.js";
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

test("лёд повторяет прошлый ход удвоенным — две клетки в том же направлении", () => {
  const { g, p } = scene([[[2, 6], { type: "ice" }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, [4, 6]);
});

test("лёд удваивает и диагональный ход", () => {
  const g = blankGame();
  setCell(g, [2, 7], { type: "ice" });
  const p = putPirate(g, 0, [1, 6]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 7] });
  assert.deepEqual(pirate(r.state, p.id).at, [4, 9]);
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

test("цепочка стрелка → лёд → крокодил разрешается за один ход", () => {
  const { g, p } = scene([
    [[2, 6], { type: "arrow", dirs: [[1, 0]] }],
    [[3, 6], { type: "ice" }],
    [[5, 6], { type: "croc" }],
  ]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, [3, 6]);
  assert.equal(r.state.activeTeam, 1);
});

test("встречные стрелки не вешают движок", () => {
  const { g, p } = scene([
    [[2, 6], { type: "arrow", dirs: [[1, 0]] }],
    [[3, 6], { type: "arrow", dirs: [[-1, 0]] }],
  ]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
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
