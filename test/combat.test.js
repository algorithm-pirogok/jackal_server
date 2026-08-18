import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, legalActions } from "../engine/rules.js";
import { blankGame, setCell, putPirate, pirate, actionsFor } from "./helpers.js";

const at = (a, [r, c]) => a.to[0] === r && a.to[1] === c;

test("приход на клетку врага отправляет его на свой корабль", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6]);
  const enemy = putPirate(g, 1, [2, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.deepEqual(pirate(r.state, enemy.id).at, r.state.teams[1].ship);
  assert.equal(pirate(r.state, enemy.id).place, "ship");
  assert.deepEqual(pirate(r.state, p.id).at, [2, 6]);
});

test("монета побеждённого остаётся на клетке", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6]);
  const enemy = putPirate(g, 1, [2, 6], { coin: true });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.board[2][6].coins, 1);
  assert.equal(pirate(r.state, enemy.id).coin, false);
});

test("пирата в крепости выбить нельзя", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "fort", open: true });
  const p = putPirate(g, 0, [1, 6]);
  putPirate(g, 1, [2, 6]);

  const acts = actionsFor(legalActions(g), p.id);
  assert.equal(acts.some((a) => at(a, [2, 6])), false);
});

test("пирата в крепости с туземкой тоже не выбить", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "fortNative", open: true });
  const p = putPirate(g, 0, [1, 6]);
  putPirate(g, 1, [2, 6]);

  const acts = actionsFor(legalActions(g), p.id);
  assert.equal(acts.some((a) => at(a, [2, 6])), false);
});

test("две команды одного игрока стоят на клетке мирно", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6]);
  const mate = putPirate(g, 2, [2, 6]); // команда 2 — тот же игрок A

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.deepEqual(pirate(r.state, mate.id).at, [2, 6]);
  assert.equal(pirate(r.state, mate.id).place, "land");
});

test("пират не идёт в бой, не выпустив монету из рук", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6], { coin: true });
  putPirate(g, 1, [2, 6]);

  const acts = actionsFor(legalActions(g), p.id);
  const carrying = acts.filter((a) => at(a, [2, 6]) && !a.dropCoin);
  assert.deepEqual(carrying, [], "с монетой в руках в бой нельзя");

  // Оставить монету на своей клетке и напасть налегке — законно.
  assert.ok(acts.some((a) => at(a, [2, 6]) && a.dropCoin));
});

test("выбитый пират теряет капкан", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6]);
  const enemy = putPirate(g, 1, [2, 6], { trapped: true });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, enemy.id).place, "ship");
  assert.equal(pirate(r.state, enemy.id).trapped, false);
});

test("выбитый из лабиринта пират теряет уровень", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "jungle", steps: 2, open: true });
  const p = putPirate(g, 0, [1, 6]);
  const enemy = putPirate(g, 1, [2, 6], { mazeLevel: 1, mazeOf: 2 });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, enemy.id).place, "ship");
  assert.equal(pirate(r.state, enemy.id).mazeLevel, 0);
  assert.equal(pirate(r.state, enemy.id).mazeOf, 0);
});

test("пришедший последним выбивает всех врагов на клетке", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6]);
  const e1 = putPirate(g, 1, [2, 6]);
  const e2 = putPirate(g, 3, [2, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, e1.id).place, "ship");
  assert.equal(pirate(r.state, e2.id).place, "ship");
});
