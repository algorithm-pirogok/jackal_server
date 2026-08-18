// Урезание состояния под конкретного игрока.
//
// Клиент не должен получать ничего, чего его игрок не знает: ни типов закрытых
// клеток, ни сида раскладки. Иначе весь остров читается из devtools за минуту
// и играть становится не во что.

import { scoreOf } from "./state.js";
import { legalActions } from "./moves.js";

export function redact(state, owner) {
  const board = state.board.map((row) =>
    row.map((cell) => (cell.open ? { ...cell } : { open: false })),
  );

  const isPlayer = owner === "A" || owner === "B";
  const yourTurn =
    isPlayer && state.phase === "playing" && state.teams[state.activeTeam].owner === owner;

  return {
    phase: state.phase,
    winner: state.winner,
    activeTeam: state.activeTeam,
    you: owner,
    yourTurn,
    board,
    teams: state.teams.map((t) => ({ ...t, ship: [...t.ship] })),
    pirates: state.pirates.map((p) => ({
      id: p.id,
      team: p.team,
      at: [...p.at],
      place: p.place,
      coin: p.coin,
      dead: p.dead,
      trapped: p.trapped,
      spinnerLeft: p.spinnerLeft,
      skipTurns: Math.max(0, (p.skipUntilTeamTurn ?? 0) - state.teamTurns[p.team]),
    })),
    pending: state.pending
      ? {
          pirate: state.pending.pirate,
          kind: state.pending.kind,
          options: state.pending.options.map((o) => [...o]),
        }
      : null,
    legal: yourTurn ? legalActions(state) : [],
    score: { A: scoreOf(state, "A"), B: scoreOf(state, "B") },
    log: [...state.log],
  };
}
