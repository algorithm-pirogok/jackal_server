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

test("сойти можно только на клетку прямо перед кораблём", () => {
  const g = blankGame(7);
  const p = g.pirates.find((x) => x.team === 0);

  // Корабль севера стоит на [0,6], значит единственный трап — на [1,6].
  assert.equal(applyAction(g, "A", { type: "land", pirate: p.id, to: [1, 6] }).ok, true);
  for (const to of [[1, 5], [1, 7], [1, 9], [2, 6]]) {
    assert.equal(
      applyAction(g, "A", { type: "land", pirate: p.id, to }).ok,
      false,
      `высадка на ${to} должна быть запрещена`,
    );
  }
});

test("у каждой команды свой единственный трап, по своему берегу", () => {
  const expected = { 0: [1, 6], 1: [6, 11], 2: [11, 6], 3: [6, 1] };

  for (const teamId of [0, 1, 2, 3]) {
    const g = blankGame(7);
    g.activeTeam = teamId;
    const landings = legalActions(g).filter((a) => a.type === "land");
    const cells = [...new Set(landings.map((a) => String(a.to)))];
    assert.deepEqual(cells, [String(expected[teamId])], `команда ${teamId}`);
    assert.equal(landings.length, 3, "трап один, но сойти может любой из трёх пиратов");
  }
});

test("трап следует за кораблём при его движении", () => {
  const g = blankGame(7);
  const moved = applyAction(g, "A", { type: "ship", to: [0, 7] }).state;
  moved.activeTeam = 0;
  const cells = [
    ...new Set(legalActions(moved).filter((a) => a.type === "land").map((a) => String(a.to))),
  ];
  assert.deepEqual(cells, [String([1, 7])]);
});

test("legalActions предлагает только действия активной команды", () => {
  const g = blankGame(7);
  for (const a of legalActions(g)) {
    if (a.type === "ship") continue;
    assert.equal(pirate(g, a.pirate).team, 0);
  }
});

test("после хода очередь идёт по часовой: N E S W", () => {
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

test("корабль подбирает своего пирата, барахтающегося в воде", () => {
  const g = blankGame(7);
  const p = g.pirates.find((x) => x.team === 0);
  p.place = "sea";
  p.at = [0, 7];

  const r = applyAction(g, "A", { type: "ship", to: [0, 7] });
  assert.equal(r.ok, true);
  assert.equal(pirate(r.state, p.id).place, "ship");
  assert.deepEqual(pirate(r.state, p.id).at, [0, 7]);
});

test("чужого пирата из воды корабль не подбирает", () => {
  const g = blankGame(7);
  const enemy = g.pirates.find((x) => x.team === 1);
  enemy.place = "sea";
  enemy.at = [0, 7];

  const r = applyAction(g, "A", { type: "ship", to: [0, 7] });
  assert.equal(pirate(r.state, enemy.id).place, "sea");
});
