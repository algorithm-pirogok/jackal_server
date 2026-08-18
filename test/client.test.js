// Прогон клиента на DOM-заглушке с настоящим состоянием движка.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { installDom } from "./domshim.js";

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const dom = installDom(here("../web/index.html"), { search: "?room=TEST" });
await import(here("../web/app.js"));

const { createGame } = await import("../engine/state.js");
const { applyAction } = await import("../engine/rules.js");
const { redact } = await import("../engine/view.js");

let game = createGame(2026);
const socket = dom.sockets[0];

function push(owner = "A") {
  socket.deliver({ type: "state", view: redact(game, owner), events: [] });
}
const board = () => dom.registry.get("board");
const cellAt = (r, c) => board().querySelector(`[data-cell="${r},${c}"]`);
const sentActions = () => socket.sent.filter((m) => m.type === "action").map((m) => m.action);

// Клиент подсвечивает клетки классами hl-move / hl-ship / hl-pick.
const HL = ["hl-move", "hl-ship", "hl-pick"];
const highlighted = () =>
  board().descendants().filter((n) => n.dataset.cell && HL.some((c) => n.classList.contains(c)));

test("клиент представился и подписался на комнату", () => {
  socket.onopen?.(); // заглушка не открывает сокет сама
  assert.ok(socket.url.includes("/ws?room=TEST"), "подключился не к той комнате: " + socket.url);
  assert.equal(socket.sent[0]?.type, "hello");
  assert.ok(socket.sent[0].sessionId, "sessionId не отправлен");
});

test("поле рисуется целиком: 169 клеток", () => {
  socket.deliver({ type: "joined", owner: "A" });
  push();
  const cells = board().descendants().filter((n) => n.dataset.cell);
  assert.equal(cells.length, 169);
});

test("закрытые клетки не выдают тип, море отличается от суши", () => {
  const closed = board().descendants().filter((n) => n.classList.contains("closed"));
  const sea = board().descendants().filter((n) => n.classList.contains("sea"));
  assert.equal(closed.length, 117, "должно быть ровно 117 закрытых клеток острова");
  assert.ok(sea.length > 0, "море не отрисовано");
});

test("панель показывает счёт, чей ход и кто ты", () => {
  const text = ["score", "turn", "whoami"].map((id) => dom.registry.get(id).textContent).join(" ");
  assert.match(text, /A/);
  assert.match(text, /B/);
  assert.ok(text.length > 10, "панель пустая");
});

test("клик по своему кораблю подсвечивает ходы, клик по клетке шлёт легальное действие", () => {
  const ship = game.teams[0].ship;
  cellAt(ship[0], ship[1]).dispatch("click");

  const targets = highlighted();
  assert.ok(targets.length > 0, "после клика по кораблю ничего не подсветилось");

  const before = sentActions().length;
  targets[0].dispatch("click");
  const sent = sentActions();
  assert.equal(sent.length, before + 1, "действие не отправлено");

  const legal = redact(game, "A").legal;
  const match = legal.some((a) => JSON.stringify(a) === JSON.stringify(sent.at(-1)));
  assert.ok(match, "отправлено действие, которого нет в legal: " + JSON.stringify(sent.at(-1)));
});

test("сервер принимает то, что прислал клиент", () => {
  const action = sentActions().at(-1);
  const r = applyAction(game, "A", action);
  assert.equal(r.ok, true, "движок отклонил ход клиента: " + r.reason);
  game = r.state;
});

test("высадка пирата проходит весь путь клиент → движок", () => {
  game.activeTeam = 0;
  push();
  const ship = game.teams[0].ship;
  cellAt(ship[0], ship[1]).dispatch("click");

  const targets = highlighted();
  assert.ok(targets.length > 0, "трап не подсвечен");
  targets[0].dispatch("click");

  const action = sentActions().at(-1);
  const r = applyAction(game, "A", action);
  assert.equal(r.ok, true, "движок отклонил: " + r.reason);
  game = r.state;
  assert.ok(game.pirates.some((p) => p.place === "land"), "никто не сошёл на берег");
});

test("чужой ход не даёт подсветки", () => {
  game.activeTeam = 1;
  push("A");
  assert.equal(highlighted().length, 0, "подсветка показана в чужой ход");
});

test("отказ сервера показывается игроку", () => {
  socket.deliver({ type: "reject", reason: "Недопустимый ход" });
  const toast = dom.registry.get("toast");
  assert.match(toast.textContent, /Недопустимый ход/);
});

test("конец партии показывает победителя", () => {
  const view = redact(game, "A");
  view.phase = "finished";
  view.winner = "A";
  socket.deliver({ type: "state", view, events: [] });
  assert.match(dom.registry.get("banner").textContent, /A/);
});
