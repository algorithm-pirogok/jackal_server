// Эффекты клеток и разрешение цепочек.
//
// Ключевая идея: ход пирата — это не один шаг, а цепочка. Пират встал на
// стрелку, она унесла его на лёд, лёд протащил дальше на крокодила, крокодил
// вернул назад. Всё это происходит внутри одного хода и разрешается здесь,
// пока не наступит покой либо пока игра не спросит игрока о выборе
// направления (тогда выставляется state.pending и цепочка ставится на паузу).

import { inBounds, isIsland, isSea, SIZE } from "./board.js";
import { DIRS8, SPINNER_STEPS } from "./tiles.js";
import { ownerOfTeam, piratesAt } from "./state.js";

const MAX_CHAIN = 32; // страховка от стрелок, зацикленных друг на друга

function sign(x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function unitDir(from, to) {
  const dr = sign(to[0] - from[0]);
  const dc = sign(to[1] - from[1]);
  return dr === 0 && dc === 0 ? null : [dr, dc];
}

function same(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

// Корабли того же игрока: на любой из них можно взойти и сдать монету.
function ownShipAt(state, pirate, [r, c]) {
  const owner = ownerOfTeam(pirate.team);
  return state.teams.find((t) => t.owner === owner && same(t.ship, [r, c])) ?? null;
}

export function ownTeamShip(state, pirate) {
  return state.teams[pirate.team].ship;
}

// Можно ли пирату войти в клетку.
//   withCoin — считать ли, что он с монетой (при подъёме монеты это уже правда,
//              хотя монета ещё не в руках).
//   forced   — шаг вынужденный: стрелка, лёд, конь. Вынужденно пирата можно
//              зашвырнуть в открытое море и загнать на закрытую клетку с
//              монетой, добровольно — нельзя.
export function canEnter(state, pirate, to, withCoin, forced = false) {
  if (!inBounds(to[0], to[1])) return false;

  if (isSea(to[0], to[1])) {
    // На свой корабль взойти можно всегда. В открытое море пират сам не лезет —
    // он оказывается там только пушкой или стрелкой, и тогда уже плывёт.
    if (ownShipAt(state, pirate, to)) return true;
    return forced || pirate.place === "sea";
  }

  const target = state.board[to[0]][to[1]];

  // С монетой в руках новые клетки не открывают.
  if (withCoin && !target.open && !forced) return false;

  const owner = ownerOfTeam(pirate.team);
  const enemies = piratesAt(state, to[0], to[1]).filter(
    (q) => ownerOfTeam(q.team) !== owner,
  );

  if (enemies.length > 0) {
    if (withCoin) return false; // с монетой в бой не вступают
    if (target.type === "fort" || target.type === "fortNative") return false;
  }

  return true;
}

// Физическое перемещение пирата в клетку со всеми немедленными следствиями:
// бой, открытие клетки, посадка на корабль, утопление монеты.
function enter(state, pirate, to, dir, events) {
  pirate.cameFrom = [...pirate.at];
  pirate.lastDir = dir ? [...dir] : null;
  pirate.at = [...to];

  const ship = ownShipAt(state, pirate, to);
  if (ship) {
    pirate.place = "ship";
    if (pirate.coin) {
      pirate.coin = false;
      ship.delivered += 1;
      events.push(`Команда ${ship.shore} доставила монету на корабль`);
    }
    return;
  }

  if (isSea(to[0], to[1])) {
    pirate.place = "sea";
    if (pirate.coin) {
      pirate.coin = false;
      events.push("Монета утонула в море");
    }
    return;
  }

  pirate.place = "land";
  const target = state.board[to[0]][to[1]];

  if (!target.open) {
    target.open = true;
    events.push(`Открыта клетка: ${target.type}`);
  }

  knockOutEnemies(state, pirate, to, events);
  freeTrappedFriends(state, pirate, to, events);
}

// Пришедший выбивает всех врагов на клетке — они уходят на свои корабли,
// груз остаётся здесь же.
function knockOutEnemies(state, pirate, to, events) {
  const owner = ownerOfTeam(pirate.team);
  for (const enemy of piratesAt(state, to[0], to[1])) {
    if (ownerOfTeam(enemy.team) === owner) continue;
    if (enemy.coin) {
      enemy.coin = false;
      dropCoinOn(state, to, 1);
    }
    enemy.at = [...state.teams[enemy.team].ship];
    enemy.place = "ship";
    enemy.trapped = false;
    enemy.spinnerLeft = 0;
    enemy.cameFrom = null;
    enemy.lastDir = null;
    events.push(`Пират ${enemy.id} выбит на свой корабль`);
  }
}

// Товарищ пришёл на капкан — вызволяет застрявшего. Сам при этом не попадается:
// иначе двое менялись бы местами в капкане бесконечно.
function freeTrappedFriends(state, pirate, to, events) {
  const owner = ownerOfTeam(pirate.team);
  let freed = false;
  for (const mate of piratesAt(state, to[0], to[1])) {
    if (mate.id === pirate.id) continue;
    if (ownerOfTeam(mate.team) !== owner) continue;
    if (mate.trapped) {
      mate.trapped = false;
      freed = true;
      events.push(`Пират ${mate.id} освобождён из капкана`);
    }
  }
  pirate.justFreedMate = freed;
}

export function dropCoinOn(state, [r, c], amount) {
  const target = state.board[r][c];
  target.coins = (target.coins ?? 0) + amount;
}

// Эффект клетки, на которой пират уже стоит.
// Возвращает {to, dir} чтобы продолжить цепочку, "pending" — если нужен выбор
// игрока, либо null — если пират остановился.
function effectOf(state, pirate, events) {
  const [r, c] = pirate.at;
  const target = state.board[r][c];

  switch (target.type) {
    case "arrow": {
      const options = target.dirs
        .map(([dr, dc]) => [r + dr, c + dc])
        .filter((to) => canEnter(state, pirate, to, pirate.coin, true));
      if (options.length === 0) return null;
      if (options.length === 1) {
        return { to: options[0], dir: unitDir([r, c], options[0]) };
      }
      state.pending = { pirate: pirate.id, kind: "arrow", options };
      return "pending";
    }

    case "ice": {
      if (!pirate.lastDir) return null;
      const to = [r + pirate.lastDir[0], c + pirate.lastDir[1]];
      if (!canEnter(state, pirate, to, pirate.coin, true)) return null;
      events.push("Лёд проносит пирата дальше");
      return { to, dir: pirate.lastDir };
    }

    case "croc": {
      const back = pirate.cameFrom;
      if (!back) return null;
      events.push("Крокодил отогнал пирата назад");
      // Возврат не запускает эффект той клетки заново — иначе пара
      // «крокодил напротив стрелки» зациклилась бы.
      pirate.at = [...back];
      pirate.place = isSea(back[0], back[1]) ? "sea" : "land";
      pirate.lastDir = null;
      return null;
    }

    case "knight": {
      const jumps = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ];
      const options = jumps
        .map(([dr, dc]) => [r + dr, c + dc])
        .filter((to) => canEnter(state, pirate, to, pirate.coin, true));
      if (options.length === 0) return null;
      state.pending = { pirate: pirate.id, kind: "knight", options };
      return "pending";
    }

    case "plane": {
      if (state.planeUsed) return null;
      const options = [];
      for (let rr = 0; rr < SIZE; rr++) {
        for (let cc = 0; cc < SIZE; cc++) {
          if (!isIsland(rr, cc)) continue;
          if (rr === r && cc === c) continue;
          if (canEnter(state, pirate, [rr, cc], pirate.coin, true)) options.push([rr, cc]);
        }
      }
      if (options.length === 0) return null;
      state.planeUsed = true;
      state.pending = { pirate: pirate.id, kind: "plane", options };
      events.push("Самолёт заведён — выберите, куда лететь");
      return "pending";
    }

    case "balloon": {
      const team = state.teams[pirate.team];
      events.push("Воздушный шар унёс пирата на корабль");
      pirate.at = [...team.ship];
      pirate.place = "ship";
      pirate.lastDir = null;
      // Шар — законный способ доставить золото: летит вместе с пиратом.
      if (pirate.coin) {
        pirate.coin = false;
        team.delivered += 1;
        events.push(`Команда ${team.shore} доставила монету шаром`);
      }
      return null;
    }

    case "cannon": {
      const dir = cannonDir(r, c);
      let [rr, cc] = [r, c];
      while (isIsland(rr + dir[0], cc + dir[1])) {
        rr += dir[0];
        cc += dir[1];
      }
      const landing = [rr + dir[0], cc + dir[1]];
      if (!inBounds(landing[0], landing[1])) return null;
      events.push("Пушка выстрелила пиратом в море");
      if (pirate.coin) {
        pirate.coin = false;
        dropCoinOn(state, [r, c], 1);
      }
      pirate.at = landing;
      pirate.place = "sea";
      pirate.lastDir = null;
      return null;
    }

    case "cannibal": {
      events.push(`Людоед съел пирата ${pirate.id}`);
      if (pirate.coin) {
        pirate.coin = false;
        dropCoinOn(state, [r, c], 1);
      }
      pirate.dead = true;
      pirate.place = "land";
      return null;
    }

    case "trap": {
      if (!pirate.justFreedMate) {
        pirate.trapped = true;
        events.push(`Пират ${pirate.id} попал в капкан`);
      }
      return null;
    }

    case "rum": {
      pirate.skipUntilTeamTurn = state.teamTurns[pirate.team] + 2;
      events.push(`Пират ${pirate.id} напился рома и пропустит ход`);
      return null;
    }

    case "fortNative": {
      const dead = state.pirates.find((p) => p.dead && p.team === pirate.team);
      if (dead) {
        dead.dead = false;
        dead.at = [...state.teams[dead.team].ship];
        dead.place = "ship";
        events.push(`Туземка воскресила пирата ${dead.id}`);
      }
      return null;
    }

    case "jungle":
    case "desert":
    case "swamp":
    case "mountain": {
      const steps = target.steps ?? SPINNER_STEPS[target.type];
      pirate.spinnerLeft = steps - 1;
      events.push(`Пират застрял: ${target.type}, ещё ${pirate.spinnerLeft} ход(ов)`);
      return null;
    }

    default:
      return null; // empty, money, fort, sea
  }
}

function cannonDir(r, c) {
  const mid = (SIZE - 1) / 2;
  const dr = sign(r - mid);
  const dc = sign(c - mid);
  if (dr === 0 && dc === 0) return [-1, 0];
  return [dr, dc];
}

// Полный ход пирата: шаг в клетку и разрешение всей цепочки эффектов.
export function moveAndResolve(state, pirate, to, events) {
  let target = [...to];
  let dir = unitDir(pirate.at, to);
  let guard = 0;

  while (target) {
    if (++guard > MAX_CHAIN) {
      events.push("Пират закружился и остановился");
      break;
    }
    enter(state, pirate, target, dir, events);
    if (pirate.dead || pirate.place !== "land") break;

    const next = effectOf(state, pirate, events);
    if (next === "pending" || next === null) break;
    target = next.to;
    dir = next.dir;
  }

  delete pirate.justFreedMate;
}

// Продолжение цепочки после того, как игрок ответил на pending.
export function continueAfterChoice(state, pirate, to, events) {
  state.pending = null;
  moveAndResolve(state, pirate, to, events);
}

export { unitDir, same, ownShipAt };
