// Единая точка входа движка. Сервер зовёт только applyAction.

import {
  cloneState,
  pirateById,
  scoreOf,
  ownerOfTeam,
  COINS_TO_WIN,
} from "./state.js";
import { SIZE, isIsland } from "./board.js";
import { legalActions, sameAction } from "./moves.js";
import { moveAndResolve, continueAfterChoice, dropCoinOn } from "./effects.js";

export { legalActions };

const LOG_LIMIT = 80;

export function applyAction(state, player, action) {
  if (state.phase !== "playing") {
    return { ok: false, reason: "Партия уже закончена" };
  }

  const team = state.teams[state.activeTeam];
  if (player !== team.owner) {
    return { ok: false, reason: "Сейчас не ваш ход" };
  }

  const match = legalActions(state).find((a) => sameAction(a, action));
  if (!match) {
    return { ok: false, reason: "Недопустимый ход" };
  }

  const next = cloneState(state);
  const events = [];

  switch (match.type) {
    case "ship":
      moveShip(next, next.teams[next.activeTeam], match.to, events);
      endTurn(next);
      break;

    case "land": {
      const p = pirateById(next, match.pirate);
      moveAndResolve(next, p, match.to, events);
      if (!next.pending) endTurn(next);
      break;
    }

    case "move": {
      const p = pirateById(next, match.pirate);
      applyCoinIntent(next, p, match, events);
      moveAndResolve(next, p, match.to, events);
      if (!next.pending) endTurn(next);
      break;
    }

    case "choose": {
      const p = pirateById(next, next.pending.pirate);
      continueAfterChoice(next, p, match.to, events);
      if (!next.pending) endTurn(next);
      break;
    }

    case "stay": {
      const p = pirateById(next, match.pirate);
      p.spinnerLeft = Math.max(0, p.spinnerLeft - 1);
      events.push(`Пират ${p.id} пробивается дальше`);
      endTurn(next);
      break;
    }

    default:
      return { ok: false, reason: "Неизвестное действие" };
  }

  checkVictory(next, events);
  next.log = [...events, ...next.log].slice(0, LOG_LIMIT);
  return { ok: true, state: next, events };
}

// Корабль везёт с собой всех, кто на нём стоит.
function moveShip(state, team, to, events) {
  const from = team.ship;
  for (const p of state.pirates) {
    if (p.place === "ship" && p.at[0] === from[0] && p.at[1] === from[1]) {
      p.at = [...to];
    }
  }
  team.ship = [...to];
  events.push(`Корабль ${team.shore} сдвинулся`);
}

// Подъём и выкладывание монеты происходят на клетке, с которой пират уходит.
function applyCoinIntent(state, pirate, action, events) {
  const here = state.board[pirate.at[0]][pirate.at[1]];
  if (action.takeCoin) {
    here.coins -= 1;
    pirate.coin = true;
    events.push(`Пират ${pirate.id} поднял монету`);
  }
  if (action.dropCoin) {
    pirate.coin = false;
    dropCoinOn(state, pirate.at, 1);
    events.push(`Пират ${pirate.id} оставил монету`);
  }
}

function endTurn(state) {
  state.teamTurns[state.activeTeam] += 1;
  state.activeTeam = (state.activeTeam + 1) % state.teams.length;
}

export function coinsLeftInPlay(state) {
  let total = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isIsland(r, c)) total += state.board[r][c].coins ?? 0;
    }
  }
  for (const p of state.pirates) if (p.coin) total += 1;
  return total;
}

function checkVictory(state, events) {
  for (const owner of ["A", "B"]) {
    if (scoreOf(state, owner) >= COINS_TO_WIN) {
      state.phase = "finished";
      state.winner = owner;
      events.push(`Игрок ${owner} победил: ${scoreOf(state, owner)} монет`);
      return;
    }
  }

  if (coinsLeftInPlay(state) === 0) {
    const a = scoreOf(state, "A");
    const b = scoreOf(state, "B");
    state.phase = "finished";
    state.winner = a === b ? null : a > b ? "A" : "B";
    events.push(
      state.winner ? `Золото кончилось. Победил игрок ${state.winner}` : "Золото кончилось. Ничья",
    );
  }
}

export { ownerOfTeam };
