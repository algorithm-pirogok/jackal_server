import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, isIsland, isSea, SHORES, createBoard } from "../engine/board.js";

test("остров — ровно 117 клеток", () => {
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (isIsland(r, c)) n++;
  }
  assert.equal(n, 117);
});

test("углы острова вырезаны", () => {
  for (const [r, c] of [[1, 1], [1, 11], [11, 1], [11, 11]]) {
    assert.equal(isIsland(r, c), false);
    assert.equal(isSea(r, c), true);
  }
});

test("крайние ряды острова длиной 9", () => {
  let topRow = 0;
  for (let c = 0; c < SIZE; c++) if (isIsland(1, c)) topRow++;
  assert.equal(topRow, 9);
});

test("за пределами поля не остров и не море", () => {
  assert.equal(isIsland(-1, 5), false);
  assert.equal(isSea(-1, 5), false);
  assert.equal(isSea(13, 5), false);
});

test("у каждого берега 9 позиций корабля, старт в середине", () => {
  assert.equal(SHORES.length, 4);
  for (const s of SHORES) {
    assert.equal(s.cells.length, 9);
    assert.deepEqual(s.start, s.cells[4]);
    for (const [r, c] of s.cells) assert.equal(isSea(r, c), true);
  }
});

test("берега идут в порядке N, W, S, E", () => {
  assert.deepEqual(SHORES.map((s) => s.shore), ["N", "W", "S", "E"]);
  assert.deepEqual(SHORES.map((s) => s.start), [[0, 6], [6, 0], [12, 6], [6, 12]]);
});

test("раскладка детерминирована по сиду и покрывает весь остров", () => {
  const a = createBoard(42);
  const b = createBoard(42);
  const c = createBoard(43);

  let islandCells = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let col = 0; col < SIZE; col++) {
      if (isIsland(r, col)) {
        islandCells++;
        assert.equal(a[r][col].open, false, `клетка ${r},${col} должна быть закрыта`);
        assert.notEqual(a[r][col].type, "sea");
      } else {
        assert.equal(a[r][col].type, "sea");
        assert.equal(a[r][col].open, true);
      }
    }
  }

  assert.equal(islandCells, 117);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("раскладка сохраняет состав колоды", () => {
  const board = createBoard(11);
  const counts = {};
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isIsland(r, c)) counts[board[r][c].type] = (counts[board[r][c].type] ?? 0) + 1;
    }
  }
  assert.equal(counts.empty, 40);
  assert.equal(counts.arrow, 21);
  assert.equal(counts.money, 16);
  assert.equal(counts.cannibal, 1);
});
