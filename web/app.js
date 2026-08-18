// Клиент «Шакала»: рисует состояние, присланное сервером, и отправляет обратно
// действия ровно в том виде, в каком они пришли в view.legal.

const SIZE = 13;

const TEAM_COLORS = ["#e2453c", "#3b82f6", "#22a06b", "#e8b71a"];
const TEAM_NAMES = ["север", "запад", "юг", "восток"];

const TYPE_GLYPH = {
  empty: "",
  money: "💰",
  jungle: "🌴",
  desert: "🏜️",
  swamp: "🐸",
  mountain: "⛰️",
  ice: "🧊",
  croc: "🐊",
  rum: "🍺",
  trap: "🪤",
  knight: "🐴",
  cannon: "💣",
  fort: "🏰",
  fortNative: "👸",
  balloon: "🎈",
  cannibal: "👹",
  plane: "✈️",
};

const TYPE_NAME = {
  sea: "море",
  empty: "пусто",
  arrow: "стрелки",
  money: "монеты",
  jungle: "джунгли",
  desert: "пустыня",
  swamp: "болото",
  mountain: "гора",
  ice: "лёд",
  croc: "крокодил",
  rum: "ром",
  trap: "ловушка",
  knight: "конь",
  cannon: "пушка",
  fort: "форт",
  fortNative: "форт с туземкой",
  balloon: "воздушный шар",
  cannibal: "людоед",
  plane: "самолёт",
};

const ARROW_GLYPH = {
  "-1,0": "↑",
  "1,0": "↓",
  "0,1": "→",
  "0,-1": "←",
  "-1,-1": "↖",
  "-1,1": "↗",
  "1,1": "↘",
  "1,-1": "↙",
};

const PENDING_TEXT = {
  arrow: "Стрелка: выберите, куда пойдёт пират.",
  knight: "Конь: выберите, куда прыгнет пират.",
  plane: "Самолёт: выберите, куда полетит пират.",
};

const ROOM_CODE_RE = /^[A-Z0-9-]{1,16}$/;

// --- состояние клиента ---

const app = {
  roomCode: "",
  socket: null,
  owner: null,
  view: null,
  connStatus: "offline", // offline | connecting | online | reconnecting
  reconnectTimer: null,
  reconnectAttempt: 0,
  selection: null, // {kind:"pirate", id} | {kind:"ship"}
  menu: null, // {r, c, actions:[...]}
  toastTimer: null,
  lastHandledEvent: null, // клик по полю: чтобы глобальный обработчик его не «снимал»
};

const el = {};

// --- утилиты ---

function byId(id) {
  return document.getElementById(id);
}

function cellKey(r, c) {
  return r + "," + c;
}

function makeSessionId() {
  const bytes = new Uint8Array(16);
  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function getSessionId() {
  let id = null;
  try {
    id = localStorage.getItem("jackal.sessionId");
  } catch {
    id = null;
  }
  if (!id) {
    id = makeSessionId();
    try {
      localStorage.setItem("jackal.sessionId", id);
    } catch {
      // приватный режим — сессия проживёт до перезагрузки вкладки
    }
  }
  return id;
}

function inviteLink(code) {
  return location.origin + location.pathname + "?room=" + encodeURIComponent(code);
}

function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(text).then(
      () => showToast("Ссылка скопирована", false),
      () => copyTextFallback(text),
    );
    return;
  }
  copyTextFallback(text);
}

function copyTextFallback(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "readonly");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  showToast(ok ? "Ссылка скопирована" : "Скопируйте ссылку вручную", !ok);
}

function showToast(text, isError) {
  el.toast.textContent = text;
  el.toast.style.background = isError === false ? "#14472c" : "#4a1d1d";
  el.toast.style.borderColor = isError === false ? "#4ade80" : "#ef4444";
  el.toast.style.color = "#fff";
  el.toast.classList.remove("hidden");
  clearTimeout(app.toastTimer);
  app.toastTimer = setTimeout(() => el.toast.classList.add("hidden"), 4500);
}

// --- связь ---

function connect(code) {
  app.roomCode = code;
  clearTimeout(app.reconnectTimer);

  if (app.socket) {
    app.socket.onopen = null;
    app.socket.onmessage = null;
    app.socket.onclose = null;
    app.socket.onerror = null;
    try {
      app.socket.close();
    } catch {
      // уже закрыт
    }
    app.socket = null;
  }

  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  const url = scheme + "//" + location.host + "/ws?room=" + encodeURIComponent(code);

  app.connStatus = app.reconnectAttempt > 0 ? "reconnecting" : "connecting";
  render();

  let socket;
  try {
    socket = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  app.socket = socket;

  socket.onopen = () => {
    app.connStatus = "online";
    app.reconnectAttempt = 0;
    socket.send(JSON.stringify({ type: "hello", sessionId: getSessionId() }));
    render();
  };

  socket.onmessage = (event) => onServerMessage(event.data);

  socket.onclose = () => {
    if (app.socket !== socket) return;
    app.socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    // за ошибкой всегда следует close — переподключение произойдёт там
  };
}

function scheduleReconnect() {
  if (!app.roomCode) return;
  app.connStatus = "reconnecting";
  app.reconnectAttempt += 1;
  const delay = Math.min(1000 * app.reconnectAttempt, 8000);
  render();
  clearTimeout(app.reconnectTimer);
  app.reconnectTimer = setTimeout(() => connect(app.roomCode), delay);
}

function onServerMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === "joined") {
    app.owner = msg.owner;
    render();
    return;
  }

  if (msg.type === "state") {
    app.view = msg.view;
    app.selection = null;
    app.menu = null;
    render();
    return;
  }

  if (msg.type === "reject") {
    app.selection = null;
    app.menu = null;
    showToast(msg.reason || "Ход отклонён", true);
    render();
  }
}

function sendAction(action) {
  app.menu = null;
  app.selection = null;
  if (!app.socket || app.socket.readyState !== WebSocket.OPEN) {
    showToast("Нет связи с сервером", true);
    render();
    return;
  }
  app.socket.send(JSON.stringify({ type: "action", action }));
  render();
}

// --- разбор состояния ---

function legalActions() {
  return app.view && Array.isArray(app.view.legal) ? app.view.legal : [];
}

function pirateById(id) {
  if (!app.view) return null;
  return app.view.pirates.find((p) => p.id === id) || null;
}

// Номер пирата внутри своей команды (1..3) — id может быть любым.
function buildPirateLabels() {
  const labels = new Map();
  const counters = new Map();
  if (!app.view) return labels;
  for (const p of app.view.pirates) {
    const n = (counters.get(p.team) || 0) + 1;
    counters.set(p.team, n);
    labels.set(p.id, n);
  }
  return labels;
}

function groupPiratesByCell() {
  const map = new Map();
  if (!app.view) return map;
  for (const p of app.view.pirates) {
    if (p.dead) continue;
    const key = cellKey(p.at[0], p.at[1]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return map;
}

function shipsByCell() {
  const map = new Map();
  if (!app.view) return map;
  for (const team of app.view.teams) {
    map.set(cellKey(team.ship[0], team.ship[1]), team);
  }
  return map;
}

// Пираты, которыми сейчас вообще можно что-то сделать.
function movablePirateIds() {
  const ids = new Set();
  for (const a of legalActions()) {
    if (a.pirate !== undefined && a.pirate !== null) ids.add(a.pirate);
  }
  return ids;
}

function shipActions() {
  return legalActions().filter((a) => a.type === "ship");
}

function stayActionFor(pirateId) {
  return legalActions().find((a) => a.type === "stay" && a.pirate === pirateId) || null;
}

// Клетки, подсвеченные для текущего выбора: ключ клетки -> список действий.
function targetsForSelection() {
  const map = new Map();
  const push = (to, action) => {
    const key = cellKey(to[0], to[1]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(action);
  };

  if (!app.view) return map;

  if (app.view.pending) {
    for (const a of legalActions()) {
      if (a.type === "choose") push(a.to, a);
    }
    return map;
  }

  if (!app.selection) return map;

  if (app.selection.kind === "ship") {
    for (const a of shipActions()) push(a.to, a);
    return map;
  }

  for (const a of legalActions()) {
    if ((a.type === "move" || a.type === "land") && a.pirate === app.selection.id) push(a.to, a);
  }
  return map;
}

function targetClass() {
  if (app.view && app.view.pending) return "target-choice";
  if (app.selection && app.selection.kind === "ship") return "target-ship";
  return "";
}

// --- клики ---

function handleClick(r, c, focus) {
  if (!app.view) return;

  const targets = targetsForSelection();
  const actions = targets.get(cellKey(r, c));

  closeMenu();

  if (actions && actions.length === 1) {
    sendAction(actions[0]);
    return;
  }
  if (actions && actions.length > 1) {
    openMenu(r, c, actions);
    return;
  }

  if (app.view.pending) {
    // Во время выбора по стрелке/коню/самолёту другие клики бессмысленны.
    render();
    return;
  }

  if (focus && focus.kind === "ship") {
    selectShipAt(r, c);
    return;
  }
  if (focus && focus.kind === "pirate" && movablePirateIds().has(focus.id)) {
    app.selection = { kind: "pirate", id: focus.id };
    render();
    return;
  }

  selectSomethingAt(r, c);
}

// Клик по клетке без явной цели: перебираем своих пиратов на ней, потом корабль.
function selectSomethingAt(r, c) {
  const movable = movablePirateIds();
  const here = app.view.pirates.filter(
    (p) => !p.dead && p.at[0] === r && p.at[1] === c && movable.has(p.id),
  );

  if (here.length > 0) {
    let index = 0;
    if (app.selection && app.selection.kind === "pirate") {
      const current = here.findIndex((p) => p.id === app.selection.id);
      if (current >= 0) index = (current + 1) % here.length;
    }
    app.selection = { kind: "pirate", id: here[index].id };
    render();
    return;
  }

  const ship = shipsByCell().get(cellKey(r, c));
  if (ship && shipActions().length > 0 && ship.id === app.view.activeTeam) {
    app.selection = { kind: "ship" };
    render();
    return;
  }

  app.selection = null;
  render();
}

function selectShipAt(r, c) {
  const ship = shipsByCell().get(cellKey(r, c));
  if (ship && ship.id === app.view.activeTeam && shipActions().length > 0) {
    app.selection = { kind: "ship" };
  } else {
    selectSomethingAt(r, c);
    return;
  }
  render();
}

// --- меню выбора варианта хода (взять / оставить монету) ---

function actionLabel(action) {
  if (action.type === "choose") return "сюда";
  if (action.type === "ship") return "плыть сюда";
  if (action.takeCoin) return "взять 💰";
  if (action.dropCoin) return "оставить 💰";
  if (action.type === "land") return "высадиться";
  return "идти";
}

function openMenu(r, c, actions) {
  app.menu = { r, c, actions };
  render();
}

function closeMenu() {
  app.menu = null;
}

function renderMenu() {
  el.menu.textContent = "";
  if (!app.menu) {
    el.menu.classList.add("hidden");
    return;
  }

  for (const action of app.menu.actions) {
    const button = document.createElement("button");
    button.className = "small";
    button.textContent = actionLabel(action);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      sendAction(action);
    });
    el.menu.appendChild(button);
  }

  el.menu.classList.remove("hidden");

  const cell = el.board.querySelector('[data-cell="' + cellKey(app.menu.r, app.menu.c) + '"]');
  if (!cell) return;
  const rect = cell.getBoundingClientRect();
  const menuRect = el.menu.getBoundingClientRect();

  let left = rect.left + rect.width / 2 - menuRect.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - menuRect.width - 6));

  let top = rect.top - menuRect.height - 6;
  if (top < 6) top = rect.bottom + 6;

  el.menu.style.left = Math.round(left) + "px";
  el.menu.style.top = Math.round(top) + "px";
}

// --- отрисовка поля ---

function renderBoard() {
  el.board.textContent = "";
  if (!app.view) return;

  const targets = targetsForSelection();
  const extraTargetClass = targetClass();
  const pirates = groupPiratesByCell();
  const ships = shipsByCell();
  const labels = buildPirateLabels();
  const movable = movablePirateIds();

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = app.view.board[r] ? app.view.board[r][c] : null;
      const node = document.createElement("div");
      node.className = "cell";
      node.dataset.cell = cellKey(r, c);

      fillCell(node, cell);

      const ship = ships.get(cellKey(r, c));
      if (ship) node.appendChild(makeShip(ship, r, c));

      const here = pirates.get(cellKey(r, c));
      if (here && here.length > 0) {
        node.appendChild(makeTokens(here, labels, movable, r, c));
      }

      if (targets.has(cellKey(r, c))) {
        node.classList.add("target");
        if (extraTargetClass) node.classList.add(extraTargetClass);
      } else if (here && here.some((p) => movable.has(p.id))) {
        node.classList.add("pickable");
      }

      node.addEventListener("click", (event) => {
        app.lastHandledEvent = event;
        handleClick(r, c, null);
      });
      el.board.appendChild(node);
    }
  }
}

function fillCell(node, cell) {
  if (!cell || !cell.open) {
    node.classList.add("closed");
    node.title = "Закрытая клетка";
    return;
  }

  if (cell.type === "sea") {
    node.classList.add("sea");
    return;
  }

  node.classList.add("open");
  node.title = TYPE_NAME[cell.type] || cell.type;

  if (cell.type === "arrow" && Array.isArray(cell.dirs)) {
    node.appendChild(makeArrows(cell.dirs));
  } else {
    const glyph = TYPE_GLYPH[cell.type];
    if (glyph) {
      const span = document.createElement("div");
      span.className = "glyph";
      span.textContent = glyph;
      node.appendChild(span);
    }
  }

  if (typeof cell.steps === "number" && cell.steps > 0) {
    node.title += ", шагов: " + cell.steps;
  }

  if (typeof cell.coins === "number" && cell.coins > 0) {
    const coins = document.createElement("div");
    coins.className = "coins";
    coins.textContent = cell.type === "money" ? "×" + cell.coins : "💰" + cell.coins;
    node.appendChild(coins);
    node.title += ", монет: " + cell.coins;
  }
}

function makeArrows(dirs) {
  const box = document.createElement("div");
  const count = Math.min(dirs.length, 4);
  box.className = "arrows n" + count;
  for (const dir of dirs) {
    const span = document.createElement("span");
    span.textContent = ARROW_GLYPH[dir[0] + "," + dir[1]] || "•";
    box.appendChild(span);
  }
  return box;
}

function makeShip(team, r, c) {
  const node = document.createElement("div");
  node.className = "ship";
  node.style.background = TEAM_COLORS[team.id] || "#888";
  node.textContent = "⛵";
  node.title =
    "Корабль команды " + (TEAM_NAMES[team.id] || team.id) +
    " (игрок " + team.owner + "), доставлено монет: " + team.delivered;
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    handleClick(r, c, { kind: "ship" });
  });
  return node;
}

function makeTokens(list, labels, movable, r, c) {
  const box = document.createElement("div");
  box.className = "tokens";

  for (const pirate of list) {
    const token = document.createElement("div");
    token.className = "token";
    token.style.background = TEAM_COLORS[pirate.team] || "#888";
    token.textContent = String(labels.get(pirate.id) || "?");

    if (movable.has(pirate.id)) token.classList.add("movable");
    if (app.selection && app.selection.kind === "pirate" && app.selection.id === pirate.id) {
      token.classList.add("selected");
    }
    if (pirate.trapped) token.classList.add("trapped");
    if (pirate.spinnerLeft > 0) token.classList.add("spinner");
    if (pirate.skipTurns > 0) token.classList.add("resting");

    token.title = pirateTitle(pirate, labels);

    if (pirate.coin) {
      const coin = document.createElement("div");
      coin.className = "coin";
      token.appendChild(coin);
    }

    token.addEventListener("click", (event) => {
      event.stopPropagation();
      handleClick(r, c, { kind: "pirate", id: pirate.id });
    });

    box.appendChild(token);
  }

  return box;
}

function pirateTitle(pirate, labels) {
  const parts = [
    "Пират " + (labels.get(pirate.id) || "?") + ", команда " + (TEAM_NAMES[pirate.team] || pirate.team),
  ];
  if (pirate.coin) parts.push("несёт монету");
  if (pirate.trapped) parts.push("в ловушке");
  if (pirate.spinnerLeft > 0) parts.push("вертушка: " + pirate.spinnerLeft);
  if (pirate.skipTurns > 0) parts.push("пропускает ходов: " + pirate.skipTurns);
  if (pirate.place === "sea") parts.push("в воде");
  if (pirate.place === "ship") parts.push("на корабле");
  return parts.join(", ");
}

// --- отрисовка панели ---

function renderPanel() {
  el.panelRoom.textContent = app.roomCode || "—";
  renderScore();
  renderTurn();
  renderWhoami();
  renderPending();
  renderControls();
  renderBanner();
  renderConnection();
  renderStatuses();
  renderLog();
}

function renderScore() {
  el.score.textContent = "";
  const you = app.view ? app.view.you : app.owner;
  const score = app.view && app.view.score ? app.view.score : { A: 0, B: 0 };

  for (const side of ["A", "B"]) {
    const chip = document.createElement("div");
    chip.className = "chip" + (you === side ? " you" : "");
    const value = document.createElement("b");
    value.textContent = String(score[side] ?? 0);
    const name = document.createElement("span");
    name.textContent = "Игрок " + side + (you === side ? " (вы)" : "");
    chip.appendChild(value);
    chip.appendChild(name);
    el.score.appendChild(chip);
  }
}

function teamDot(teamId) {
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = TEAM_COLORS[teamId] || "#888";
  return dot;
}

function renderTurn() {
  el.turn.textContent = "";
  el.turn.classList.remove("mine");

  if (!app.view) {
    el.turn.textContent = "Ожидание состояния…";
    return;
  }

  const team = app.view.teams.find((t) => t.id === app.view.activeTeam);
  const line = document.createElement("div");
  line.appendChild(teamDot(app.view.activeTeam));
  line.appendChild(
    document.createTextNode(
      "Ходит " + (TEAM_NAMES[app.view.activeTeam] || app.view.activeTeam) +
      (team ? " (игрок " + team.owner + ")" : ""),
    ),
  );
  el.turn.appendChild(line);

  const hint = document.createElement("small");
  if (app.view.phase === "finished") {
    hint.textContent = "Партия окончена";
  } else if (app.view.you === "spectator") {
    hint.textContent = "Вы наблюдаете за партией";
  } else if (app.view.yourTurn) {
    hint.textContent = "Ваш ход — выберите пирата";
    el.turn.classList.add("mine");
  } else {
    hint.textContent = "Ход соперника, ждём";
  }
  el.turn.appendChild(hint);
}

function renderWhoami() {
  el.whoami.textContent = "";
  if (!app.view) {
    el.whoami.textContent = app.owner ? "Вы: " + app.owner : "Подключение…";
    return;
  }

  if (app.view.you === "spectator") {
    el.whoami.textContent = "Вы наблюдатель — ходить нельзя";
    return;
  }

  el.whoami.appendChild(document.createTextNode("Вы: игрок " + app.view.you + " — "));
  const mine = app.view.teams.filter((t) => t.owner === app.view.you);
  mine.forEach((team, index) => {
    if (index > 0) el.whoami.appendChild(document.createTextNode(", "));
    el.whoami.appendChild(teamDot(team.id));
    el.whoami.appendChild(document.createTextNode(TEAM_NAMES[team.id] || String(team.id)));
  });
}

function renderPending() {
  if (!app.view || !app.view.pending) {
    el.pending.classList.add("hidden");
    el.pending.textContent = "";
    return;
  }
  const pending = app.view.pending;
  const text = PENDING_TEXT[pending.kind] || "Выберите клетку.";
  el.pending.textContent = app.view.yourTurn ? text : "Соперник выбирает направление…";
  el.pending.classList.remove("hidden");
}

function renderControls() {
  el.controls.textContent = "";
  if (!app.view || !app.view.yourTurn) return;

  if (app.selection && app.selection.kind === "pirate") {
    const labels = buildPirateLabels();
    const pirate = pirateById(app.selection.id);
    if (pirate) {
      const info = document.createElement("span");
      info.className = "muted";
      info.textContent =
        "Выбран пират " + (labels.get(pirate.id) || "?") +
        " (" + (TEAM_NAMES[pirate.team] || pirate.team) + ")";
      el.controls.appendChild(info);
    }

    const stay = stayActionFor(app.selection.id);
    if (stay) {
      const button = document.createElement("button");
      button.className = "small";
      button.textContent = "Простоять ход";
      button.addEventListener("click", () => sendAction(stay));
      el.controls.appendChild(button);
    }
  } else if (app.selection && app.selection.kind === "ship") {
    const info = document.createElement("span");
    info.className = "muted";
    info.textContent = "Выбран корабль";
    el.controls.appendChild(info);
  }

  if (app.selection) {
    const cancel = document.createElement("button");
    cancel.className = "small";
    cancel.textContent = "Снять выделение";
    cancel.addEventListener("click", () => {
      app.selection = null;
      closeMenu();
      render();
    });
    el.controls.appendChild(cancel);
  }
}

function renderBanner() {
  if (!app.view || app.view.phase !== "finished") {
    el.banner.classList.add("hidden");
    el.banner.textContent = "";
    el.banner.className = "banner hidden";
    return;
  }

  const winner = app.view.winner;
  let text;
  let mood = "";
  if (winner === null || winner === undefined) {
    text = "🤝 Ничья";
  } else {
    text = "🏆 Победил игрок " + winner;
    if (app.view.you === winner) mood = " win";
    else if (app.view.you === "A" || app.view.you === "B") mood = " lose";
  }

  el.banner.className = "banner" + mood;
  el.banner.textContent = text;
}

function renderConnection() {
  const labels = {
    offline: "нет связи",
    connecting: "подключаюсь…",
    online: "на связи",
    reconnecting: "переподключаюсь…",
  };
  const colors = {
    offline: "#ef4444",
    connecting: "#f59e0b",
    online: "#4ade80",
    reconnecting: "#f59e0b",
  };

  el.conn.className = "conn " + app.connStatus;
  el.conn.textContent = "";
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = colors[app.connStatus] || "#888";
  el.conn.appendChild(dot);
  el.conn.appendChild(document.createTextNode("Связь: " + (labels[app.connStatus] || app.connStatus)));
}

function renderStatuses() {
  el.statuses.textContent = "";
  if (!app.view) return;

  const labels = buildPirateLabels();
  const notable = app.view.pirates.filter(
    (p) => !p.dead && (p.trapped || p.spinnerLeft > 0 || p.skipTurns > 0 || p.coin),
  );

  if (notable.length === 0) {
    const item = document.createElement("li");
    item.textContent = "все пираты в порядке";
    el.statuses.appendChild(item);
    return;
  }

  for (const pirate of notable) {
    const item = document.createElement("li");
    item.appendChild(teamDot(pirate.team));
    item.appendChild(document.createTextNode(pirateTitle(pirate, labels)));
    el.statuses.appendChild(item);
  }
}

function renderLog() {
  el.log.textContent = "";
  if (!app.view || !Array.isArray(app.view.log)) return;
  for (const line of app.view.log.slice(0, 60)) {
    const item = document.createElement("li");
    item.textContent = line;
    el.log.appendChild(item);
  }
}

// --- общий рендер ---

function render() {
  if (app.roomCode) {
    el.join.classList.add("hidden");
    el.game.classList.remove("hidden");
    renderBoard();
    renderPanel();
    renderMenu();
  } else {
    el.game.classList.add("hidden");
    el.join.classList.remove("hidden");
    el.menu.classList.add("hidden");
  }
}

// --- экран входа ---

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

function updateJoinLink() {
  const code = normalizeCode(el.roomInput.value);
  el.joinLink.textContent = ROOM_CODE_RE.test(code) ? inviteLink(code) : "введите код комнаты";
}

function startGame(code) {
  if (!ROOM_CODE_RE.test(code)) {
    el.joinError.textContent = "Код комнаты: латиница, цифры и дефис, от 1 до 16 знаков.";
    el.joinError.classList.remove("hidden");
    return;
  }
  el.joinError.classList.add("hidden");
  app.reconnectAttempt = 0;
  history.replaceState(null, "", inviteLink(code));
  connect(code);
}

function leaveGame() {
  clearTimeout(app.reconnectTimer);
  if (app.socket) {
    app.socket.onclose = null;
    try {
      app.socket.close();
    } catch {
      // уже закрыт
    }
    app.socket = null;
  }
  app.roomCode = "";
  app.view = null;
  app.owner = null;
  app.selection = null;
  app.menu = null;
  app.connStatus = "offline";
  history.replaceState(null, "", location.origin + location.pathname);
  updateJoinLink();
  render();
}

function bindUi() {
  el.join = byId("join");
  el.game = byId("game");
  el.board = byId("board");
  el.menu = byId("menu");
  el.toast = byId("toast");

  el.roomInput = byId("room-input");
  el.joinForm = byId("join-form");
  el.joinError = byId("join-error");
  el.joinLink = byId("join-link");
  el.joinCopy = byId("join-copy");

  el.panelRoom = byId("panel-room");
  el.panelCopy = byId("panel-copy");
  el.panelLeave = byId("panel-leave");
  el.score = byId("score");
  el.turn = byId("turn");
  el.whoami = byId("whoami");
  el.pending = byId("pending");
  el.controls = byId("controls");
  el.banner = byId("banner");
  el.conn = byId("conn");
  el.statuses = byId("statuses");
  el.log = byId("log");

  el.joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startGame(normalizeCode(el.roomInput.value));
  });
  el.roomInput.addEventListener("input", updateJoinLink);

  el.joinCopy.addEventListener("click", () => {
    const code = normalizeCode(el.roomInput.value);
    if (!ROOM_CODE_RE.test(code)) {
      showToast("Сначала введите код комнаты", true);
      return;
    }
    copyText(inviteLink(code));
  });

  el.panelCopy.addEventListener("click", () => copyText(inviteLink(app.roomCode)));
  el.panelLeave.addEventListener("click", leaveGame);

  el.menu.addEventListener("click", (event) => event.stopPropagation());

  // Клик вне поля и меню снимает выделение.
  document.addEventListener("click", (event) => {
    if (!app.selection && !app.menu) return;
    // Клик по клетке уже обработан; после перерисовки узел отвязан от документа,
    // поэтому сравниваем сам объект события, а не положение цели в DOM.
    if (event === app.lastHandledEvent) return;
    if (el.board.contains(event.target) || el.menu.contains(event.target)) return;
    if (el.controls.contains(event.target)) return;
    app.selection = null;
    closeMenu();
    render();
  });

  window.addEventListener("resize", () => {
    if (app.menu) renderMenu();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    app.selection = null;
    closeMenu();
    render();
  });
}

function start() {
  bindUi();

  const code = normalizeCode(new URLSearchParams(location.search).get("room") || "");
  if (ROOM_CODE_RE.test(code)) {
    el.roomInput.value = code;
    updateJoinLink();
    startGame(code);
    return;
  }

  updateJoinLink();
  render();
}

start();
