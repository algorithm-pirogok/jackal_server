import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, legalActions } from "../engine/rules.js";
import {
  blankGame, setCell, putPirate, pirate, rotateTo, endTeamTurn, actionsFor,
} from "./helpers.js";

function scene(cells) {
  const g = blankGame();
  for (const [at, cell] of cells) setCell(g, at, cell);
  const p = putPirate(g, 0, [1, 6]);
  return { g, p };
}

test("джунгли — это лабиринт на два уровня, вход на первый", () => {
  const { g, p } = scene([[[2, 6], { type: "jungle", steps: 2 }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).mazeLevel, 1);
  assert.equal(pirate(r.state, p.id).mazeOf, 2);
});

test("болото — лабиринт на четыре уровня", () => {
  const { g, p } = scene([[[2, 6], { type: "swamp", steps: 4 }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).mazeLevel, 1);
  assert.equal(pirate(r.state, p.id).mazeOf, 4);
});

test("не дойдя до последнего уровня, пират может только пробиваться дальше", () => {
  const { g, p } = scene([[[2, 6], { type: "swamp", steps: 4 }]]);
  const s = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);
  assert.deepEqual(actionsFor(legalActions(s), p.id), [{ type: "maze", pirate: p.id }]);
});

test("каждый ход продвигает на уровень, с последнего пират снова свободен", () => {
  const { g, p } = scene([[[2, 6], { type: "jungle", steps: 2 }]]);
  let s = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);

  s = rotateTo(applyAction(s, "A", { type: "maze", pirate: p.id }).state, 0);
  assert.equal(pirate(s, p.id).mazeLevel, 2, "добрался до последнего уровня");
  assert.ok(actionsFor(legalActions(s), p.id).some((a) => a.type === "move"), "может выйти");
});

test("выйдя из лабиринта, пират забывает уровень", () => {
  const { g, p } = scene([[[2, 6], { type: "jungle", steps: 2 }]]);
  let s = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);
  s = rotateTo(applyAction(s, "A", { type: "maze", pirate: p.id }).state, 0);
  s = applyAction(s, "A", { type: "move", pirate: p.id, to: [3, 6] }).state;

  assert.deepEqual(pirate(s, p.id).at, [3, 6]);
  assert.equal(pirate(s, p.id).mazeLevel, 0);
  assert.equal(pirate(s, p.id).mazeOf, 0);
});

test("гора — самый глубокий лабиринт, пять уровней", () => {
  const { g, p } = scene([[[2, 6], { type: "mountain", steps: 5 }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).mazeOf, 5);
});

test("врага, забравшегося глубже, выбить нельзя", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "swamp", steps: 4, open: true });
  const p = putPirate(g, 0, [1, 6]);
  const enemy = putPirate(g, 1, [2, 6], { mazeLevel: 3, mazeOf: 4 });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.ok, true);
  assert.deepEqual(pirate(r.state, enemy.id).at, [2, 6], "враг остался в лабиринте");
  assert.equal(pirate(r.state, enemy.id).mazeLevel, 3);
  assert.equal(pirate(r.state, p.id).mazeLevel, 1, "пришедший стоит на первом уровне");
});

test("врага на том же уровне лабиринта выбить можно", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "swamp", steps: 4, open: true });
  const p = putPirate(g, 0, [1, 6]);
  const enemy = putPirate(g, 1, [2, 6], { mazeLevel: 1, mazeOf: 4 });

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, enemy.id).at, r.state.teams[1].ship);
  assert.equal(pirate(r.state, enemy.id).mazeLevel, 0);
});

test("пустыня монету не отнимает", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "desert", steps: 3, open: true });
  const p = putPirate(g, 0, [1, 6], { coin: true });
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).coin, true);
});

test("ром выключает пирата ровно на один ход его команды", () => {
  const { g, p } = scene([[[2, 6], { type: "rum" }]]);
  const s = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);

  assert.equal(actionsFor(legalActions(s), p.id).length, 0, "первый ход после рома пропущен");

  rotateTo(endTeamTurn(s), 0);
  assert.ok(actionsFor(legalActions(s), p.id).length > 0, "дальше пират снова ходит");
});

test("остальные пираты команды ходят, пока один пьёт", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "rum" });
  const p = putPirate(g, 0, [1, 6]);
  const mate = putPirate(g, 0, [1, 8]);
  const s = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);
  assert.ok(actionsFor(legalActions(s), mate.id).length > 0);
});

test("капкан держит пирата, пока не придёт товарищ", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "trap" });
  const p1 = putPirate(g, 0, [1, 6]);
  const p2 = putPirate(g, 0, [1, 7]);

  const s = rotateTo(applyAction(g, "A", { type: "move", pirate: p1.id, to: [2, 6] }).state, 0);
  assert.equal(pirate(s, p1.id).trapped, true);
  assert.equal(actionsFor(legalActions(s), p1.id).length, 0);

  const after = applyAction(s, "A", { type: "move", pirate: p2.id, to: [2, 6] });
  assert.equal(pirate(after.state, p1.id).trapped, false);
  assert.equal(pirate(after.state, p2.id).trapped, false, "спасатель сам не попадается");
});

test("враг не спасает из капкана, а выбивает на корабль и попадается сам", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "trap" });
  const p1 = putPirate(g, 0, [1, 6]);
  const enemy = putPirate(g, 1, [3, 6]);

  const s = rotateTo(applyAction(g, "A", { type: "move", pirate: p1.id, to: [2, 6] }).state, 1);
  const after = applyAction(s, "B", { type: "move", pirate: enemy.id, to: [2, 6] });

  assert.deepEqual(pirate(after.state, p1.id).at, after.state.teams[0].ship);
  assert.equal(pirate(after.state, p1.id).place, "ship");
  assert.equal(pirate(after.state, enemy.id).trapped, true);
});
