// Геометрия поля и раскладка клеток.
//
// Поле 13x13. Внешнее кольцо — море, по которому ходят корабли и плавают
// пираты. Остров — квадрат 11x11 (индексы 1..11) минус четыре угловые клетки,
// итого 117 клеток. Из-за срезанных углов крайние ряды острова имеют длину 9 —
// столько же позиций у каждого корабля вдоль своего берега.

import { buildDeck } from "./tiles.js";
import { makeRng, shuffle } from "./random.js";

export const SIZE = 13;

const ISLAND_MIN = 1;
const ISLAND_MAX = 11;

export function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function isIsland(r, c) {
  if (!inBounds(r, c)) return false;
  if (r < ISLAND_MIN || r > ISLAND_MAX || c < ISLAND_MIN || c > ISLAND_MAX) return false;
  const onEdgeRow = r === ISLAND_MIN || r === ISLAND_MAX;
  const onEdgeCol = c === ISLAND_MIN || c === ISLAND_MAX;
  return !(onEdgeRow && onEdgeCol); // срезаем четыре угла
}

export function isSea(r, c) {
  return inBounds(r, c) && !isIsland(r, c);
}

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

// Берега в порядке хода: N, W, S, E. Чередование по чётности даёт чередование
// людей — команды 0 и 2 у игрока A, команды 1 и 3 у игрока B.
export const SHORES = [
  { team: 0, shore: "N", cells: range(2, 10).map((c) => [0, c]) },
  { team: 1, shore: "W", cells: range(2, 10).map((r) => [r, 0]) },
  { team: 2, shore: "S", cells: range(2, 10).map((c) => [12, c]) },
  { team: 3, shore: "E", cells: range(2, 10).map((r) => [r, 12]) },
].map((s) => ({ ...s, start: s.cells[Math.floor(s.cells.length / 2)] }));

export function createBoard(seed) {
  const deck = shuffle(makeRng(seed), buildDeck());
  let next = 0;

  const board = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      if (isIsland(r, c)) {
        row.push({ ...deck[next++], open: false });
      } else {
        row.push({ type: "sea", open: true });
      }
    }
    board.push(row);
  }

  if (next !== deck.length) {
    throw new Error(`раскладка не сошлась: выложено ${next} из ${deck.length}`);
  }
  return board;
}
