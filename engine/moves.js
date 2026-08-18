// Перечисление легальных действий активной команды.
// Единственный источник правды о том, что можно сделать: и сервер валидирует
// через него, и клиент рисует подсветку из него же.

import { SHORES, isIsland, inBounds, landingCellFor } from "./board.js";
import { DIRS8, STATIONARY } from "./tiles.js";
import { canEnter } from "./effects.js";

function shoreIndex(shore, ship) {
  return shore.cells.findIndex(([r, c]) => r === ship[0] && c === ship[1]);
}

// Пират пропускает ход из-за рома? Счётчик хранится в «номерах ходов команды»,
// а не в декременте: так пропуск ровно один и не съедается тем же ходом,
// на котором пират выпил.
export function blockedByRum(state, pirate) {
  return state.teamTurns[pirate.team] < (pirate.skipUntilTeamTurn ?? 0);
}

export function legalActions(state) {
  if (state.phase !== "playing") return [];

  if (state.pending) {
    return state.pending.options.map((to) => ({ type: "choose", to: [...to] }));
  }

  const team = state.teams[state.activeTeam];
  const out = [];

  const shore = SHORES[team.id];
  const idx = shoreIndex(shore, team.ship);
  for (const j of [idx - 1, idx + 1]) {
    if (j >= 0 && j < shore.cells.length) {
      out.push({ type: "ship", to: [...shore.cells[j]] });
    }
  }

  for (const p of state.pirates) {
    if (p.team !== team.id || p.dead) continue;
    if (blockedByRum(state, p)) continue;

    // В лабиринте пират не свободен: пока не добрался до последнего уровня,
    // единственное, что он может — продвинуться на следующий.
    if (p.mazeLevel > 0 && p.mazeLevel < p.mazeOf) {
      out.push({ type: "maze", pirate: p.id });
      continue;
    }
    if (p.trapped) continue;

    if (p.place === "ship") {
      // Сойти можно только на клетку прямо перед кораблём.
      const to = landingCellFor(team.id, team.ship);
      if (isIsland(to[0], to[1]) && canEnter(state, p, to, false)) {
        out.push({ type: "land", pirate: p.id, to });
      }
      continue;
    }

    for (const [dr, dc] of DIRS8) {
      const to = [p.at[0] + dr, p.at[1] + dc];
      if (!inBounds(to[0], to[1])) continue;
      pushMoveVariants(state, p, to, out);
    }
  }

  return out;
}

// Для каждой соседней клетки возможны до трёх вариантов: пойти как есть,
// подобрать здесь монету и пойти, оставить здесь монету и пойти.
function pushMoveVariants(state, pirate, to, out) {
  const here = state.board[pirate.at[0]][pirate.at[1]];

  if (canEnter(state, pirate, to, pirate.coin)) {
    out.push({ type: "move", pirate: pirate.id, to });
  }

  const canTake = !pirate.coin && (here.coins ?? 0) > 0 && pirate.place === "land";
  if (canTake && canEnter(state, pirate, to, true)) {
    out.push({ type: "move", pirate: pirate.id, to, takeCoin: true });
  }

  const canDrop = pirate.coin && pirate.place === "land" && STATIONARY.has(here.type);
  if (canDrop && canEnter(state, pirate, to, false)) {
    out.push({ type: "move", pirate: pirate.id, to, dropCoin: true });
  }
}

export function sameAction(a, b) {
  if (a.type !== b.type) return false;
  if ((a.pirate ?? null) !== (b.pirate ?? null)) return false;
  if (Boolean(a.takeCoin) !== Boolean(b.takeCoin)) return false;
  if (Boolean(a.dropCoin) !== Boolean(b.dropCoin)) return false;
  if (!a.to && !b.to) return true;
  if (!a.to || !b.to) return false;
  return a.to[0] === b.to[0] && a.to[1] === b.to[1];
}
