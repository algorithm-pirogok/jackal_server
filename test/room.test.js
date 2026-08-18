import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, joinRoom, handleAction, viewFor } from "../engine/room.js";

// Фейковый движок: комната обязана работать, ничего не зная о правилах.
// Действие вида {bad: true} движок отвергает, остальные — записывает в журнал.
function fakeEngine() {
  const engine = {
    calls: [],
    createGame: (seed) => ({ seed, log: [] }),
    applyAction: (state, player, action) => {
      engine.calls.push([player, action]);
      if (action?.bad) return { ok: false, reason: "движок против" };
      return {
        ok: true,
        state: { ...state, log: [...state.log, `${player}:${action.tag}`] },
        events: [{ kind: "moved", player }],
      };
    },
    redact: (state, owner) => ({ you: owner, log: state.log }),
  };
  return engine;
}

const newRoom = (engine = fakeEngine()) => createRoom("XYZ1", 42, engine);

test("комната стартует игрой из движка по сиду", () => {
  const room = newRoom();
  assert.equal(room.code, "XYZ1");
  assert.deepEqual(room.state, { seed: 42, log: [] });
  assert.equal(room.slots.size, 0);
  assert.deepEqual(room.spectators, []);
});

test("первые два уникальных sessionId получают A и B", () => {
  const room = newRoom();
  assert.deepEqual(joinRoom(room, "s1"), { owner: "A" });
  assert.deepEqual(joinRoom(room, "s2"), { owner: "B" });
});

test("третий и последующие подключившиеся становятся зрителями", () => {
  const room = newRoom();
  joinRoom(room, "s1");
  joinRoom(room, "s2");
  assert.deepEqual(joinRoom(room, "s3"), { owner: "spectator" });
  assert.deepEqual(joinRoom(room, "s4"), { owner: "spectator" });
  assert.deepEqual(room.spectators, ["s3", "s4"]);
});

test("реконнект по тому же sessionId возвращает прежний слот", () => {
  const room = newRoom();
  joinRoom(room, "s1");
  joinRoom(room, "s2");
  joinRoom(room, "s3");
  assert.deepEqual(joinRoom(room, "s1"), { owner: "A" });
  assert.deepEqual(joinRoom(room, "s2"), { owner: "B" });
  assert.deepEqual(joinRoom(room, "s3"), { owner: "spectator" });
  // повторные входы не плодят слоты и не сдвигают цвета
  assert.equal(room.slots.size, 3);
  assert.deepEqual(room.spectators, ["s3"]);
});

test("успешное действие обновляет state комнаты", () => {
  const engine = fakeEngine();
  const room = newRoom(engine);
  joinRoom(room, "s1");

  const result = handleAction(room, "s1", { tag: "ship" });

  assert.deepEqual(result, { ok: true, events: [{ kind: "moved", player: "A" }] });
  assert.deepEqual(room.state.log, ["A:ship"]);
  assert.deepEqual(engine.calls, [["A", { tag: "ship" }]]);
});

test("действие уходит в движок от имени владельца слота, а не сессии", () => {
  const engine = fakeEngine();
  const room = newRoom(engine);
  joinRoom(room, "s1");
  joinRoom(room, "s2");

  handleAction(room, "s2", { tag: "land" });

  assert.deepEqual(engine.calls, [["B", { tag: "land" }]]);
  assert.deepEqual(room.state.log, ["B:land"]);
});

test("отказ движка не меняет state комнаты", () => {
  const room = newRoom();
  joinRoom(room, "s1");
  handleAction(room, "s1", { tag: "ship" });
  const before = room.state;

  const result = handleAction(room, "s1", { bad: true });

  assert.deepEqual(result, { ok: false, reason: "движок против" });
  assert.equal(room.state, before);
  assert.deepEqual(room.state.log, ["A:ship"]);
});

test("действие зрителя отклоняется и до движка не доходит", () => {
  const engine = fakeEngine();
  const room = newRoom(engine);
  joinRoom(room, "s1");
  joinRoom(room, "s2");
  joinRoom(room, "s3");
  const before = room.state;

  const result = handleAction(room, "s3", { tag: "ship" });

  assert.equal(result.ok, false);
  assert.match(result.reason, /Зритель/);
  assert.equal(room.state, before);
  assert.deepEqual(engine.calls, []);
});

test("действие от неизвестной сессии отклоняется", () => {
  const engine = fakeEngine();
  const room = newRoom(engine);
  joinRoom(room, "s1");
  const before = room.state;

  const result = handleAction(room, "чужой", { tag: "ship" });

  assert.equal(result.ok, false);
  assert.equal(room.state, before);
  assert.deepEqual(engine.calls, []);
});

test("viewFor урезает состояние под владельца сессии", () => {
  const room = newRoom();
  joinRoom(room, "s1");
  joinRoom(room, "s2");
  handleAction(room, "s1", { tag: "ship" });

  assert.deepEqual(viewFor(room, "s1"), { you: "A", log: ["A:ship"] });
  assert.deepEqual(viewFor(room, "s2"), { you: "B", log: ["A:ship"] });
});

test("незнакомая сессия видит поле глазами зрителя", () => {
  const room = newRoom();
  joinRoom(room, "s1");

  assert.deepEqual(viewFor(room, "прохожий"), { you: "spectator", log: [] });
});
