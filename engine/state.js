// Начальное состояние партии и общие помощники по состоянию.

import { SHORES } from "./board.js";
import { createBoard } from "./board.js";

export const TEAM_COUNT = 4;
export const PIRATES_PER_TEAM = 3;

// Монет всего 37; кто первым донёс больше половины — выиграл досрочно.
export const TOTAL_COINS = 37;
export const COINS_TO_WIN = 19;

// Чёт/нечёт: команды 0 и 2 (север и юг) — игрок A, команды 1 и 3 (запад и
// восток) — игрок B. При обходе 0→1→2→3 люди чередуются, а две команды одного
// человека стоят на противоположных берегах.
export function ownerOfTeam(teamId) {
  return teamId % 2 === 0 ? "A" : "B";
}

export function opponentOf(owner) {
  return owner === "A" ? "B" : "A";
}

export function createGame(seed) {
  const teams = SHORES.map((s) => ({
    id: s.team,
    owner: ownerOfTeam(s.team),
    shore: s.shore,
    ship: [...s.start],
    delivered: 0,
  }));

  const pirates = [];
  for (const team of teams) {
    for (let i = 0; i < PIRATES_PER_TEAM; i++) {
      pirates.push({
        id: team.id * PIRATES_PER_TEAM + i,
        team: team.id,
        at: [...team.ship],
        place: "ship", // ship | land | sea
        coin: false,
        dead: false,
        trapped: false, // сидит в капкане, ждёт товарища
        // Ром: номер хода команды, начиная с которого пират снова ходит.
        // Храним порог, а не счётчик — иначе пропуск съедался бы тем же ходом,
        // на котором пират выпил.
        skipUntilTeamTurn: 0,
        spinnerLeft: 0, // сколько ходов ещё стоять в вертушке
        cameFrom: null, // для крокодила
        lastDir: null, // для льда
      });
    }
  }

  return {
    seed,
    phase: "playing",
    winner: null,
    activeTeam: 0,
    // Сколько ходов уже сделала каждая команда. Нужен рому, чтобы отмерять
    // пропуск в ходах именно этой команды, а не в общих.
    teamTurns: [0, 0, 0, 0],
    board: createBoard(seed),
    teams,
    pirates,
    pending: null,
    planeUsed: false,
    log: [],
  };
}

export function cloneState(state) {
  return structuredClone(state);
}

export function pirateById(state, id) {
  return state.pirates.find((p) => p.id === id) ?? null;
}

export function teamsOf(state, owner) {
  return state.teams.filter((t) => t.owner === owner);
}

export function scoreOf(state, owner) {
  return teamsOf(state, owner).reduce((sum, t) => sum + t.delivered, 0);
}

// Живые пираты владельца, стоящие на клетке. Нужно и для боя, и для капкана.
export function piratesAt(state, r, c) {
  return state.pirates.filter((p) => !p.dead && p.at[0] === r && p.at[1] === c);
}
