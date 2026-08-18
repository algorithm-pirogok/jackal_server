// Каталог клеток острова и сборка колоды из 117 штук.
// Состав взят из спеки: docs/superpowers/specs/2026-08-18-jackal-online-design.md

// Восемь направлений. Строки растут вниз, столбцы вправо.
export const N = [-1, 0];
export const S = [1, 0];
export const E = [0, 1];
export const W = [0, -1];
export const NE = [-1, 1];
export const NW = [-1, -1];
export const SE = [1, 1];
export const SW = [1, -1];

export const DIRS8 = [N, NE, E, SE, S, SW, W, NW];

// Клетки, на которые разрешено класть монету. Всё остальное либо уносит пирата
// дальше, либо задерживает — оставленная там монета потерялась бы.
export const STATIONARY = new Set(["empty", "money", "fort", "fortNative", "cannibal"]);

// Лабиринты: сколько внутренних уровней у клетки. Пират входит на уровень 1,
// каждый ход продвигается на следующий и выйти может только с последнего.
export const MAZE_LEVELS = { jungle: 2, desert: 3, swamp: 4, mountain: 5 };

// Человеческие названия клеток — для судового журнала.
export const TYPE_NAMES = {
  sea: "море",
  empty: "пусто",
  arrow: "стрелки",
  money: "клад",
  jungle: "джунгли",
  desert: "пустыня",
  swamp: "болото",
  mountain: "гора",
  ice: "лёд",
  croc: "крокодил",
  rum: "бочка рома",
  trap: "капкан",
  knight: "конь",
  cannon: "пушка",
  fort: "крепость",
  fortNative: "крепость с туземкой",
  balloon: "воздушный шар",
  cannibal: "людоед",
  plane: "самолёт",
};

export function nameOf(type) {
  return TYPE_NAMES[type] ?? type;
}

export function mazeLevelsOf(cell) {
  if (!cell || !MAZE_LEVELS[cell.type]) return 0;
  return cell.steps ?? MAZE_LEVELS[cell.type];
}

// Две пушки, у каждой своё направление выстрела.
const CANNON_DIRS = [N, E];

// Монеты: 16 клеток, в сумме 37 монет.
const MONEY_COINS = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5];

// 21 клетка со стрелками, пять форм. Общее число подтверждено правилами,
// разбивка по формам — наш выбор (см. раздел «спорные правила» в спеке).
const ARROW_SHAPES = [
  // 4 одиночных диагональных
  [NW], [NE], [SE], [SW],
  // 4 двойных противоположных прямых
  [N, S], [E, W], [N, S], [E, W],
  // 4 двойных смежных диагональных
  [NW, NE], [NE, SE], [SE, SW], [SW, NW],
  // 4 четверных прямых
  [N, E, S, W], [N, E, S, W], [N, E, S, W], [N, E, S, W],
  // 5 четверных диагональных
  [NE, SE, SW, NW], [NE, SE, SW, NW], [NE, SE, SW, NW],
  [NE, SE, SW, NW], [NE, SE, SW, NW],
];

// Простые клетки без параметров: тип → количество.
const PLAIN_COUNTS = {
  empty: 40,
  ice: 6,
  croc: 4,
  rum: 4,
  trap: 3,
  knight: 2,
  fort: 2,
  balloon: 2,
  fortNative: 1,
  cannibal: 1,
  plane: 1,
};

export function buildDeck() {
  const deck = [];

  for (const [type, count] of Object.entries(PLAIN_COUNTS)) {
    for (let i = 0; i < count; i++) deck.push({ type });
  }

  for (const coins of MONEY_COINS) deck.push({ type: "money", coins });

  // У каждой пушки направление выстрела напечатано на клетке.
  for (const dir of CANNON_DIRS) deck.push({ type: "cannon", dir });

  for (const dirs of ARROW_SHAPES) deck.push({ type: "arrow", dirs });

  const mazeCounts = { jungle: 5, desert: 4, swamp: 2, mountain: 1 };
  for (const [type, count] of Object.entries(mazeCounts)) {
    for (let i = 0; i < count; i++) deck.push({ type, steps: MAZE_LEVELS[type] });
  }

  return deck;
}
