import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, legalActions } from "../engine/rules.js";
import { scoreOf } from "../engine/state.js";
import { blankGame, setCell, putPirate, pirate, actionsFor } from "./helpers.js";

const at = (a, [r, c]) => a.to[0] === r && a.to[1] === c;

test("пират поднимает монету с клетки и уносит её", () => {
  const g = blankGame();
  setCell(g, [1, 6], { type: "money", open: true, coins: 2 });
  const p = putPirate(g, 0, [1, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6], takeCoin: true });
  assert.equal(r.ok, true);
  assert.equal(pirate(r.state, p.id).coin, true);
  assert.equal(r.state.board[1][6].coins, 1);
});

test("пират несёт не больше одной монеты", () => {
  const g = blankGame();
  setCell(g, [1, 6], { type: "money", open: true, coins: 2 });
  const p = putPirate(g, 0, [1, 6], { coin: true });

  const acts = actionsFor(legalActions(g), p.id);
  assert.equal(acts.some((a) => a.takeCoin), false);
});

test("с монетой в руках нельзя открывать закрытые клетки", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "empty", open: false });
  const p = putPirate(g, 0, [1, 6], { coin: true });

  const acts = actionsFor(legalActions(g), p.id);
  const carrying = acts.filter((a) => at(a, [2, 6]) && !a.dropCoin);
  assert.deepEqual(carrying, [], "нести монету на закрытую клетку нельзя");

  // Оставить монету здесь и пойти открывать — законно.
  assert.ok(acts.some((a) => at(a, [2, 6]) && a.dropCoin));
});

test("без монеты закрытая клетка доступна", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "empty", open: false });
  const p = putPirate(g, 0, [1, 6]);

  const acts = actionsFor(legalActions(g), p.id);
  assert.ok(acts.some((a) => at(a, [2, 6])));
});

test("монету нельзя оставить на стрелке", () => {
  const g = blankGame();
  setCell(g, [1, 6], { type: "arrow", open: true, dirs: [[1, 0]] });
  const p = putPirate(g, 0, [1, 6], { coin: true });

  const acts = actionsFor(legalActions(g), p.id);
  assert.equal(acts.some((a) => a.dropCoin), false);
});

test("монету можно оставить на пустой клетке", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6], { coin: true });

  const acts = actionsFor(legalActions(g), p.id);
  assert.ok(acts.some((a) => a.dropCoin));

  const drop = acts.find((a) => a.dropCoin);
  const r = applyAction(g, "A", drop);
  assert.equal(pirate(r.state, p.id).coin, false);
  assert.equal(r.state.board[1][6].coins, 1);
});

test("доставка на свой корабль увеличивает счёт", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6], { coin: true });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [0, 6] });
  assert.equal(r.ok, true);
  assert.equal(r.state.teams[0].delivered, 1);
  assert.equal(pirate(r.state, p.id).coin, false);
  assert.equal(pirate(r.state, p.id).place, "ship");
});

test("монеты обеих команд игрока суммируются", () => {
  const g = blankGame();
  g.teams[0].delivered = 3;
  g.teams[2].delivered = 4;
  g.teams[1].delivered = 5;
  assert.equal(scoreOf(g, "A"), 7);
  assert.equal(scoreOf(g, "B"), 5);
});

test("девятнадцатая монета заканчивает партию победой", () => {
  const g = blankGame();
  g.teams[0].delivered = 18;
  const p = putPirate(g, 0, [1, 6], { coin: true });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [0, 6] });
  assert.equal(r.state.phase, "finished");
  assert.equal(r.state.winner, "A");
});

test("после конца партии ходы не принимаются", () => {
  const g = blankGame();
  g.teams[0].delivered = 18;
  const p = putPirate(g, 0, [1, 6], { coin: true });
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [0, 6] });

  const again = applyAction(r.state, "B", { type: "ship", to: [6, 1] });
  assert.equal(again.ok, false);
});

test("монета тонет, если пирата снесло в море", () => {
  const g = blankGame();
  setCell(g, [1, 10], { type: "ice", open: true });
  const p = putPirate(g, 0, [1, 9], { coin: true });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [1, 10] });
  assert.equal(r.ok, true);
  assert.equal(pirate(r.state, p.id).place, "sea");
  assert.equal(pirate(r.state, p.id).coin, false);
});

test("партия кончается, когда золото на острове исчерпано", () => {
  const g = blankGame();
  g.board[10][10] = { type: "empty", open: true }; // убираем запасной клад
  g.teams[0].delivered = 2;
  g.teams[1].delivered = 1;
  const p = putPirate(g, 0, [1, 6]);

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.phase, "finished");
  assert.equal(r.state.winner, "A");
});
