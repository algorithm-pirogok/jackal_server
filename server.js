// Deno: статика из web/ и WebSocket-комнаты. Вся логика — в engine/.
import { createGame } from "./engine/state.js";
import { applyAction } from "./engine/rules.js";
import { redact } from "./engine/view.js";
import { createRoom, joinRoom, handleAction, viewFor } from "./engine/room.js";

const engine = { createGame, applyAction, redact };

const PORT = Number(Deno.env.get("PORT") ?? 8000);
const WEB_ROOT = new URL("./web/", import.meta.url);
const ROOM_CODE = /^[A-Z0-9-]{1,16}$/;

const MIME = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
};

// Партии живут в памяти процесса: комнаты по коду и открытые сокеты по коду.
const rooms = new Map();
const connections = new Map();

// --- статика ---

function staticFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  rel = rel.startsWith("/web/") ? rel.slice("/web/".length) : rel.slice(1);
  if (rel === "") rel = "index.html";

  const parts = rel.split("/");
  const unsafe = (p) => p === "" || p === "." || p === ".." || p.includes("\\") || p.includes("\0");
  if (parts.some(unsafe)) return null;

  const url = new URL(parts.join("/"), WEB_ROOT);
  return url.href.startsWith(WEB_ROOT.href) ? url : null;
}

async function serveStatic(pathname) {
  const url = staticFile(pathname);
  if (!url) return new Response("Не найдено", { status: 404 });

  let body;
  try {
    body = await Deno.readFile(url);
  } catch {
    return new Response("Не найдено", { status: 404 });
  }

  const dot = url.pathname.lastIndexOf(".");
  const ext = dot === -1 ? "" : url.pathname.slice(dot + 1).toLowerCase();
  return new Response(body, {
    headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
  });
}

// --- комнаты и сокеты ---

function roomFor(code) {
  let room = rooms.get(code);
  if (!room) {
    room = createRoom(code, Math.floor(Math.random() * 0x7fffffff), engine);
    rooms.set(code, room);
    connections.set(code, new Set());
  }
  return room;
}

function send(socket, msg) {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(msg));
  } catch {
    // сокет умер между проверкой и отправкой — пусть его уберёт onclose
  }
}

// Каждому — своя урезанная версия состояния.
function broadcastState(room, events) {
  for (const conn of connections.get(room.code)) {
    if (conn.sessionId === null) continue;
    send(conn.socket, { type: "state", view: viewFor(room, conn.sessionId), events });
  }
}

function onMessage(room, conn, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(conn.socket, { type: "reject", reason: "Сообщение не разобрано как JSON" });
    return;
  }

  if (msg?.type === "hello") {
    if (typeof msg.sessionId !== "string" || msg.sessionId === "") {
      send(conn.socket, { type: "reject", reason: "hello без sessionId" });
      return;
    }
    conn.sessionId = msg.sessionId;
    const { owner } = joinRoom(room, msg.sessionId);
    send(conn.socket, { type: "joined", owner });
    send(conn.socket, { type: "state", view: viewFor(room, msg.sessionId), events: [] });
    return;
  }

  if (msg?.type === "action") {
    if (conn.sessionId === null) {
      send(conn.socket, { type: "reject", reason: "Сначала пришли hello" });
      return;
    }
    const result = handleAction(room, conn.sessionId, msg.action);
    if (!result.ok) {
      send(conn.socket, { type: "reject", reason: result.reason });
      return;
    }
    broadcastState(room, result.events);
    return;
  }

  send(conn.socket, { type: "reject", reason: "Неизвестный тип сообщения" });
}

function openWebSocket(req, code) {
  const { socket, response } = Deno.upgradeWebSocket(req);
  const room = roomFor(code);
  const peers = connections.get(code);
  const conn = { sessionId: null, socket };

  socket.onopen = () => peers.add(conn);
  socket.onmessage = (event) => onMessage(room, conn, event.data);
  socket.onclose = () => peers.delete(conn);
  socket.onerror = () => peers.delete(conn);

  return response;
}

// --- маршрутизация ---

Deno.serve({ port: PORT }, (req) => {
  const url = new URL(req.url);

  if (req.method !== "GET") return new Response("Метод не поддерживается", { status: 405 });

  if (url.pathname === "/ws") {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Ожидается апгрейд в WebSocket", { status: 400 });
    }
    const code = (url.searchParams.get("room") ?? "").toUpperCase();
    if (!ROOM_CODE.test(code)) return new Response("Плохой код комнаты", { status: 400 });
    return openWebSocket(req, code);
  }

  return serveStatic(url.pathname);
});
