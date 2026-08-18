import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../engine/state.js";
import { applyAction, legalActions } from "../engine/rules.js";
import { blankGame, pirate } from "./helpers.js";

test("корабль ходит на одну клетку вдоль своего берега", () => {
  const g = createGame(7);
  const r = applyAction(g, "A", { type: "ship", to: [0, 7] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.teams[0].ship, [0, 7]);
});

test("ход корабля передаёт очередь следующей команде", () => {
  const g = createGame(7);
  const r = applyAction(g, "A", { type: "ship", to: [0, 7] });
  assert.equal(r.state.activeTeam, 1);
});

test("корабль не сходит с берега и не прыгает через клетку", () => {
  const g = createGame(7);
  assert.equal(applyAction(g, "A", { type: "ship", to: [1, 6] }).ok, false);
  assert.equal(applyAction(g, "A", { type: "ship", to: [0, 8] }).ok, false);
  assert.equal(applyAction(g, "A", { type: "ship", to: [0, 1] }).ok, false);
});

test("корабль стоит на месте, если уперся в край берега", () => {
  const g = createGame(7);
  g.teams[0].ship = [0, 2];
  const moves = legalActions(g).filter((a) => a.type === "ship");
  assert.deepEqual(moves.map((a) => a.to), [[0, 3]]);
});

test("игрок не может ходить в чужую очередь", () => {
  const g = createGame(7);
  const r = applyAction(g, "B", { type: "ship", to: [0, 7] });
  assert.equal(r.ok, false);
});

test("игрок не может двигать корабль чужой команды", () => {
  const g = createGame(7);
  const r = applyAction(g, "A", { type: "ship", to: [6, 1] });
  assert.equal(r.ok, false);
});

test("высадка ставит пирата на берег и открывает клетку", () => {
  const g = createGame(7);
  const p = g.pirates.find((x) => x.team === 0);
  const r = applyAction(g, "A", { type: "land", pirate: p.id, to: [1, 6] });
  assert.equal(r.ok, true);
  assert.equal(pirate(r.state, p.id).place, "land");
  assert.equal(r.state.board[1][6].open, true);
});

test("высадиться можно только на клетку рядом с кораблём", () => {
  const g = blankGame(7);
  const p = g.pirates.find((x) => x.team === 0);
  assert.equal(applyAction(g, "A", { type: "land", pirate: p.id, to: [1, 5] }).ok, true);
  assert.equal(applyAction(g, "A", { type: "land", pirate: p.id, to: [1, 7] }).ok, true);
  assert.equal(applyAction(g, "A", { type: "land", pirate: p.id, to: [1, 9] }).ok, false);
  assert.equal(applyAction(g, "A", { type: "land", pirate: p.id, to: [2, 6] }).ok, false);
});

test("legalActions предлагает только действия активной команды", () => {
  const g = blankGame(7);
  for (const a of legalActions(g)) {
    if (a.type === "ship") continue;
    assert.equal(pirate(g, a.pirate).team, 0);
  }
});

test("после хода очередь идёт по кругу N W S E", () => {
  let g = blankGame(7);
  const order = [];
  for (let i = 0; i < 5; i++) {
    order.push(g.activeTeam);
    const owner = g.activeTeam % 2 === 0 ? "A" : "B";
    const ship = legalActions(g).find((a) => a.type === "ship");
    g = applyAction(g, owner, ship).state;
  }
  assert.deepEqual(order, [0, 1, 2, 3, 0]);
});
