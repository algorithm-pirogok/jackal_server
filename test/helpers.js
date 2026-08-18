// Помощники для тестов: собираем контролируемое поле вместо случайного.

import { createGame } from "../engine/state.js";
import { SIZE, isIsland } from "../engine/board.js";

// Партия, где весь остров — открытые пустые клетки. Дальше тест ставит
// нужные клетки точечно и не борется со случайной раскладкой.
//
// В дальнем углу оставляем клад: без единой монеты на поле движок сразу
// объявляет «золото кончилось» и закрывает партию, что ломало бы любой тест
// длиннее одного хода.
export const SPARE_TREASURE = [10, 10];

export function blankGame(seed = 1) {
  const g = createGame(seed);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isIsland(r, c)) g.board[r][c] = { type: "empty", open: true };
    }
  }
  const [tr, tc] = SPARE_TREASURE;
  g.board[tr][tc] = { type: "money", open: true, coins: 5 };
  return g;
}

export function setCell(g, [r, c], cell) {
  g.board[r][c] = { open: false, ...cell };
}

// Ставит пирата команды на клетку суши. Возвращает самого пирата.
export function putPirate(g, team, at, extra = {}) {
  const p = g.pirates.find((x) => x.team === team && x.place === "ship");
  p.place = "land";
  p.at = [...at];
  Object.assign(p, extra);
  return p;
}

export function pirate(g, id) {
  return g.pirates.find((p) => p.id === id);
}

export function cell(g, [r, c]) {
  return g.board[r][c];
}

// Отдать ход, ничего не двигая на поле. Настоящий ход обязательно что-то
// сдвинул бы (корабль), а тестам нужно проверять счётчики, а не расстановку.
export function endTeamTurn(g) {
  g.teamTurns[g.activeTeam] += 1;
  g.activeTeam = (g.activeTeam + 1) % g.teams.length;
  return g;
}

export function rotateTo(g, team) {
  let guard = 0;
  while (g.activeTeam !== team) {
    if (++guard > 16) throw new Error("не докрутили очередь до команды " + team);
    endTeamTurn(g);
  }
  return g;
}

export function actionsFor(actions, pirateId) {
  return actions.filter((a) => a.pirate === pirateId);
}
