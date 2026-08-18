import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../engine/state.js";
import { redact } from "../engine/view.js";
import { blankGame, setCell, putPirate } from "./helpers.js";

test("закрытые клетки не раскрывают свой тип", () => {
  const view = redact(createGame(3), "A");
  let closed = 0;
  for (const row of view.board) {
    for (const cell of row) {
      if (!cell.open) {
        closed++;
        assert.equal(cell.type, undefined);
        assert.equal(cell.coins, undefined);
        assert.equal(cell.dirs, undefined);
      }
    }
  }
  assert.equal(closed, 117, "в начале партии закрыт весь остров");
});

test("сид раскладки не уходит клиенту", () => {
  const view = redact(createGame(3), "A");
  assert.equal(view.seed, undefined);
  assert.equal(JSON.stringify(view).includes('"seed"'), false);
});

test("открытые клетки видны целиком", () => {
  const g = blankGame();
  setCell(g, [2, 6], { type: "money", open: true, coins: 4 });
  const view = redact(g, "A");
  assert.equal(view.board[2][6].type, "money");
  assert.equal(view.board[2][6].coins, 4);
});

test("легальные ходы приходят только тому, чей сейчас ход", () => {
  const g = blankGame();
  assert.ok(redact(g, "A").legal.length > 0);
  assert.deepEqual(redact(g, "B").legal, []);
  assert.equal(redact(g, "A").yourTurn, true);
  assert.equal(redact(g, "B").yourTurn, false);
});

test("зритель не получает ходов", () => {
  const g = blankGame();
  const view = redact(g, "spectator");
  assert.deepEqual(view.legal, []);
  assert.equal(view.yourTurn, false);
});

test("счёт считается по обеим командам игрока", () => {
  const g = blankGame();
  g.teams[0].delivered = 2;
  g.teams[2].delivered = 3;
  g.teams[3].delivered = 1;
  const view = redact(g, "A");
  assert.deepEqual(view.score, { A: 5, B: 1 });
});

test("пропуск хода из-за рома виден клиенту числом", () => {
  const g = blankGame();
  const p = putPirate(g, 0, [1, 6]);
  p.skipUntilTeamTurn = g.teamTurns[0] + 2;
  const view = redact(g, "A");
  assert.equal(view.pirates.find((x) => x.id === p.id).skipTurns, 2);
});

test("после конца партии ходов не предлагается", () => {
  const g = blankGame();
  g.phase = "finished";
  g.winner = "B";
  const view = redact(g, "A");
  assert.deepEqual(view.legal, []);
  assert.equal(view.winner, "B");
});
