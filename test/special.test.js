import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAction, legalActions } from "../engine/rules.js";
import {
  blankGame,
  setCell,
  putPirate,
  pirate,
  rotateTo,
  endTeamTurn,
  actionsFor,
} from "./helpers.js";

function scene(cells) {
  const g = blankGame();
  for (const [at, cell] of cells) setCell(g, at, cell);
  const p = putPirate(g, 0, [1, 6]);
  return { g, p };
}

test("конь предлагает только ходы буквой Г", () => {
  const { g, p } = scene([[[2, 6], { type: "knight" }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.pending.kind, "knight");
  for (const [rr, cc] of r.state.pending.options) {
    const dr = Math.abs(rr - 2);
    const dc = Math.abs(cc - 6);
    assert.ok((dr === 1 && dc === 2) || (dr === 2 && dc === 1), `не ход конём: ${rr},${cc}`);
  }
});

test("конь переносит пирата на выбранную клетку", () => {
  const { g, p } = scene([[[2, 6], { type: "knight" }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  const target = r.state.pending.options[0];
  const after = applyAction(r.state, "A", { type: "choose", to: target });
  assert.deepEqual(pirate(after.state, p.id).at, target);
});

test("шар возвращает пирата на корабль его команды", () => {
  const { g, p } = scene([[[2, 6], { type: "balloon" }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.deepEqual(pirate(r.state, p.id).at, r.state.teams[0].ship);
  assert.equal(pirate(r.state, p.id).place, "ship");
});

test("шар доставляет монету на корабль", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "balloon", open: true });
  const p = putPirate(g, 0, [1, 6], { coin: true });
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.teams[0].delivered, 1);
  assert.equal(pirate(r.state, p.id).coin, false);
});

test("самолёт срабатывает один раз за партию", () => {
  const { g, p } = scene([[[2, 6], { type: "plane" }]]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.pending.kind, "plane");
  assert.equal(r.state.planeUsed, true);

  const after = applyAction(r.state, "A", { type: "choose", to: [8, 8] });
  assert.deepEqual(pirate(after.state, p.id).at, [8, 8]);
});

test("использованный самолёт больше не взлетает", () => {
  const g = blankGame();
  g.planeUsed = true;
  setCell(g, [2, 6], { type: "plane" });
  const p = putPirate(g, 0, [1, 6]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.pending, null);
  assert.deepEqual(pirate(r.state, p.id).at, [2, 6]);
});

test("пушка, стреляющая мимо кораблей, убивает пирата", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "cannon", dir: [0, 1] }); // на восток, мимо всех кораблей
  const p = putPirate(g, 0, [1, 6]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).dead, true);
});

test("пушка, стреляющая в сторону своего корабля, спасает пирата", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "cannon", dir: [-1, 0] }); // на север, прямо в свой корабль
  const p = putPirate(g, 0, [1, 6]);
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).dead, false);
  assert.equal(pirate(r.state, p.id).place, "ship");
  assert.deepEqual(pirate(r.state, p.id).at, r.state.teams[0].ship);
});

test("выстрел в сторону своего корабля доставляет монету", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "cannon", dir: [-1, 0], open: true });
  const p = putPirate(g, 0, [1, 6], { coin: true });
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(r.state.teams[0].delivered, 1);
});

test("монета тонет вместе с пиратом, улетевшим мимо кораблей", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "cannon", dir: [0, 1], open: true });
  const p = putPirate(g, 0, [1, 6], { coin: true });
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).dead, true);
  assert.equal(pirate(r.state, p.id).coin, false);
  assert.equal(r.state.board[2][6].coins ?? 0, 0);
});

test("людоед съедает пирата, монета остаётся на клетке", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "cannibal", open: true });
  const p = putPirate(g, 0, [1, 6], { coin: true });
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, p.id).dead, true);
  assert.equal(r.state.board[2][6].coins, 1);
});

test("туземка воскрешает погибшего пирата прямо в крепости", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "fortNative" });
  const p = putPirate(g, 0, [1, 6]);
  const fallen = g.pirates.find((x) => x.team === 0 && x.id !== p.id);
  fallen.dead = true;

  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, fallen.id).dead, false);
  assert.deepEqual(pirate(r.state, fallen.id).at, [2, 6], "рождается в крепости, не на корабле");
  assert.equal(pirate(r.state, fallen.id).place, "land");
});

test("новорождённый пропускает следующий ход команды", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "fortNative" });
  const p = putPirate(g, 0, [1, 6]);
  const fallen = g.pirates.find((x) => x.team === 0 && x.id !== p.id);
  fallen.dead = true;

  const born = rotateTo(applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] }).state, 0);
  assert.equal(actionsFor(legalActions(born), fallen.id).length, 0, "роды занимают ход");

  const later = rotateTo(endTeamTurn(born), 0);
  assert.ok(actionsFor(legalActions(later), fallen.id).length > 0, "через ход он в строю");
});

test("мёртвый пират не воскресает сам по себе на пустой клетке", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6]);
  const fallen = g.pirates.find((x) => x.team === 0 && x.id !== p.id);
  fallen.dead = true;
  const r = applyAction(g, "A", { type: "move", pirate: p.id, to: [2, 6] });
  assert.equal(pirate(r.state, fallen.id).dead, true);
});
