import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, ownerOfTeam, TEAM_COUNT } from "../engine/state.js";

test("4 команды, по 3 пирата, всего 12", () => {
  const g = createGame(1);
  assert.equal(g.teams.length, TEAM_COUNT);
  assert.equal(g.pirates.length, 12);
  for (let t = 0; t < TEAM_COUNT; t++) {
    assert.equal(g.pirates.filter((p) => p.team === t).length, 3);
  }
});

test("игрок A держит противоположные берега N и S, B — E и W", () => {
  assert.equal(ownerOfTeam(0), "A");
  assert.equal(ownerOfTeam(2), "A");
  assert.equal(ownerOfTeam(1), "B");
  assert.equal(ownerOfTeam(3), "B");

  const g = createGame(1);
  assert.deepEqual(
    g.teams.map((t) => [t.shore, t.owner]),
    [["N", "A"], ["E", "B"], ["S", "A"], ["W", "B"]],
  );
});

test("все пираты стартуют на своём корабле без монет", () => {
  const g = createGame(1);
  for (const p of g.pirates) {
    assert.equal(p.place, "ship");
    assert.deepEqual(p.at, g.teams[p.team].ship);
    assert.equal(p.coin, false);
    assert.equal(p.dead, false);
  }
});

test("корабли стоят в середине своих берегов", () => {
  const g = createGame(1);
  assert.deepEqual(g.teams.map((t) => t.ship), [[0, 6], [6, 12], [12, 6], [6, 0]]);
});

test("партия начинается с команды N, без незакрытых выборов", () => {
  const g = createGame(1);
  assert.equal(g.activeTeam, 0);
  assert.equal(g.phase, "playing");
  assert.equal(g.pending, null);
  assert.equal(g.planeUsed, false);
});

test("у пиратов уникальные id", () => {
  const ids = createGame(1).pirates.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("партия воспроизводима по сиду", () => {
  assert.deepEqual(createGame(5), createGame(5));
  assert.notDeepEqual(createGame(5), createGame(6));
});
