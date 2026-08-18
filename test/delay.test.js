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

test("джунгли держат пирата два хода", () => {
  const { g, p } = scene([[[2, 6], { type: "jungle", steps: 2 }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).spinnerLeft, 1);
});

test("болото держит пирата четыре хода", () => {
  const { g, p } = scene([[[2, 6], { type: "swamp", steps: 4 }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).spinnerLeft, 3);
});

test("застрявший в вертушке может только пробиваться дальше", () => {
  const { g, p } = scene([[[2, 6], { type: "swamp", steps: 4 }]]);
  const s = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);
  const acts = actionsFor(legalActions(s), p.id);
  assert.deepEqual(acts, [{ type: "stay", pirate: p.id }]);
});

test("каждый ход в вертушке уменьшает остаток, потом пират свободен", () => {
  const { g, p } = scene([[[2, 6], { type: "jungle", steps: 2 }]]);
  let s = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);
  s = rotateTo(applyAction(s, "A", { type: "stay", pirate: p.id }).state, 0);
  assert.equal(pirate(s, p.id).spinnerLeft, 0);
  assert.ok(actionsFor(legalActions(s), p.id).some((a) => a.type === "move"));
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
