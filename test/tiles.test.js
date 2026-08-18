import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeck } from "../engine/tiles.js";
import { makeRng, shuffle } from "../engine/random.js";

test("колода состоит ровно из 117 клеток", () => {
  assert.equal(buildDeck().length, 117);
});

test("состав колоды совпадает со спекой", () => {
  const counts = {};
  for (const t of buildDeck()) counts[t.type] = (counts[t.type] ?? 0) + 1;
  assert.equal(counts.empty, 40);
  assert.equal(counts.arrow, 21);
  assert.equal(counts.money, 16);
  assert.equal(counts.ice, 6);
  assert.equal(counts.croc, 4);
  assert.equal(counts.rum, 4);
  assert.equal(counts.trap, 3);
  assert.equal(counts.knight, 2);
  assert.equal(counts.cannon, 2);
  assert.equal(counts.fort, 2);
  assert.equal(counts.balloon, 2);
  assert.equal(counts.fortNative, 1);
  assert.equal(counts.cannibal, 1);
  assert.equal(counts.plane, 1);
  assert.equal(counts.jungle, 5);
  assert.equal(counts.desert, 4);
  assert.equal(counts.swamp, 2);
  assert.equal(counts.mountain, 1);
});

test("на поле ровно 37 монет в 16 клетках", () => {
  const money = buildDeck().filter((t) => t.type === "money");
  assert.equal(money.length, 16);
  assert.equal(money.reduce((s, t) => s + t.coins, 0), 37);
});

test("у каждой стрелки непустые направления, все единичной длины", () => {
  const arrows = buildDeck().filter((t) => t.type === "arrow");
  assert.equal(arrows.length, 21);
  for (const t of arrows) {
    assert.ok(t.dirs.length > 0);
    for (const [dr, dc] of t.dirs) {
      assert.ok(Math.abs(dr) <= 1 && Math.abs(dc) <= 1);
      assert.ok(dr !== 0 || dc !== 0);
    }
  }
});

test("у вертушек задано число шагов на прохождение", () => {
  const deck = buildDeck();
  const steps = (type) => deck.find((t) => t.type === type).steps;
  assert.equal(steps("jungle"), 2);
  assert.equal(steps("desert"), 3);
  assert.equal(steps("swamp"), 4);
  assert.equal(steps("mountain"), 5);
});

test("shuffle детерминирован по сиду и сохраняет состав", () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = shuffle(makeRng(99), src);
  const b = shuffle(makeRng(99), src);
  const c = shuffle(makeRng(100), src);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual(a.slice().sort(), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
});
