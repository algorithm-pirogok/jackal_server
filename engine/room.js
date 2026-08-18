// Комната: слоты игроков, реконнект по sessionId, применение действий.
// Движок передаётся снаружи (createGame/applyAction/redact), чтобы комнату
// можно было тестировать изолированно от правил.

export const SPECTATOR = "spectator";

const SLOTS = ["A", "B"];

export function createRoom(code, seed, engine) {
  return {
    code,
    seed,
    engine,
    state: engine.createGame(seed),
    slots: new Map(), // sessionId → "A" | "B" | "spectator"
    spectators: [],
  };
}

// Слот закрепляется за sessionId навсегда: закрыл вкладку, вернулся — тот же цвет.
export function joinRoom(room, sessionId) {
  const known = room.slots.get(sessionId);
  if (known !== undefined) return { owner: known };

  const taken = new Set(room.slots.values());
  const owner = SLOTS.find((slot) => !taken.has(slot)) ?? SPECTATOR;
  room.slots.set(sessionId, owner);
  if (owner === SPECTATOR) room.spectators.push(sessionId);
  return { owner };
}

export function ownerOf(room, sessionId) {
  return room.slots.get(sessionId) ?? SPECTATOR;
}

export function handleAction(room, sessionId, action) {
  const owner = room.slots.get(sessionId);
  if (owner === undefined) return { ok: false, reason: "Эта сессия не в комнате" };
  if (owner === SPECTATOR) return { ok: false, reason: "Зритель не может ходить" };

  const result = room.engine.applyAction(room.state, owner, action);
  if (!result.ok) return { ok: false, reason: result.reason };

  room.state = result.state;
  return { ok: true, events: result.events ?? [] };
}

export function viewFor(room, sessionId) {
  return room.engine.redact(room.state, ownerOf(room, sessionId));
}
