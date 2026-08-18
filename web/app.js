// Клиент «Шакала»: рисует состояние, присланное сервером, и отправляет обратно
// действия ровно в том виде, в каком они пришли в view.legal.

const SIZE = 13;
const SVGNS = "http://www.w3.org/2000/svg";
const GOAL = 19;

// Команды: цвет + собственная форма токена + буква. Форма и буква нужны, чтобы
// красную и зелёную команду можно было различить и без цветового зрения.
const TEAMS = [
  { name: "север", letter: "С", color: "#cf3b30", shape: "circle" },
  { name: "восток", letter: "В", color: "#3b7fe0", shape: "square" },
  { name: "юг", letter: "Ю", color: "#23945f", shape: "diamond" },
  { name: "запад", letter: "З", color: "#e3b02a", shape: "hex" },
];

const TEAM_NAMES = TEAMS.map((t) => t.name);

// type клетки -> id символа в спрайте index.html. sea/empty рисуются фоном.
const TYPE_ICON = {
  money: "i-money",
  jungle: "i-jungle",
  desert: "i-desert",
  swamp: "i-swamp",
  mountain: "i-mountain",
  ice: "i-ice",
  croc: "i-croc",
  rum: "i-rum",
  trap: "i-trap",
  knight: "i-knight",
  cannon: "i-cannon",
  fort: "i-fort",
  fortNative: "i-fortNative",
  balloon: "i-balloon",
  cannibal: "i-cannibal",
  plane: "i-plane",
};

const TYPE_NAME = {
  sea: "море",
  empty: "пусто",
  arrow: "стрелки",
  money: "клад",
  jungle: "джунгли",
  desert: "пустыня",
  swamp: "болото",
  mountain: "гора",
  ice: "лёд",
  croc: "крокодил",
  rum: "бочка рома",
  trap: "капкан",
  knight: "конь",
  cannon: "пушка",
  fort: "форт",
  fortNative: "форт с туземкой",
  balloon: "воздушный шар",
  cannibal: "людоед",
  plane: "самолёт",
};

const MAZE_TYPES = new Set(["jungle", "desert", "swamp", "mountain"]);

// Углы поворота: строки растут вниз, поэтому положительный поворот — по часовой.
// Луч стрелки в спрайте смотрит вверх, ствол пушки — вправо.
const ANGLE_UP = {
  "-1,0": 0,
  "-1,1": 45,
  "0,1": 90,
  "1,1": 135,
  "1,0": 180,
  "1,-1": 225,
  "0,-1": 270,
  "-1,-1": 315,
};
const ANGLE_RIGHT = {
  "0,1": 0,
  "1,1": 45,
  "1,0": 90,
  "1,-1": 135,
  "0,-1": 180,
  "-1,-1": 225,
  "-1,0": 270,
  "-1,1": 315,
};
const DIR_NAME = {
  "-1,0": "вверх",
  "-1,1": "вверх-вправо",
  "0,1": "вправо",
  "1,1": "вниз-вправо",
  "1,0": "вниз",
  "1,-1": "вниз-влево",
  "0,-1": "влево",
  "-1,-1": "вверх-влево",
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

function dirKey(dir) {
  return dir[0] + "," + dir[1];
}

function svgNode(tag, attrs) {
  const node = document.createElementNS(SVGNS, tag);
  if (attrs) {
    for (const key of Object.keys(attrs)) {
      if (attrs[key] !== undefined && attrs[key] !== null) node.setAttribute(key, attrs[key]);
    }
  }
  return node;
}

function useNode(symbolId, attrs) {
  const node = svgNode("use", attrs);
  node.setAttribute("href", "#" + symbolId);
  return node;
}

function iconSvg(symbolId, className, viewBox) {
  const root = svgNode("svg", { class: className, viewBox: viewBox || "0 0 24 24" });
  root.appendChild(useNode(symbolId));
  return root;
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
  el.toast.className = isError === false ? "ok" : "";
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

// «Пробиваться дальше» внутри лабиринта — заменяет прежний stay.
function mazeActionFor(pirateId) {
  return legalActions().find((a) => a.type === "maze" && a.pirate === pirateId) || null;
}

function mazeActions() {
  return legalActions().filter((a) => a.type === "maze");
}

function mazeLabel(pirate) {
  if (!pirate) return null;
  const level = Number(pirate.mazeLevel) || 0;
  const of = Number(pirate.mazeOf) || 0;
  if (level <= 0 || of <= 0) return null;
  return level + "/" + of;
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
  if (app.view && app.view.pending) return "hl-pick";
  if (app.selection && app.selection.kind === "ship") return "hl-ship";
  return "hl-move";
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
  if (action.type === "choose") return "Сюда";
  if (action.type === "ship") return "Плыть сюда";
  if (action.type === "maze") return "Пробиваться дальше";
  if (action.takeCoin) return "Взять монету";
  if (action.dropCoin) return "Оставить монету";
  if (action.type === "land") return "Высадиться";
  return "Идти";
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
  for (const node of el.boardDecor) el.board.appendChild(node);
  if (!app.view) return;

  const targets = targetsForSelection();
  const extraTargetClass = targetClass();
  const pirates = groupPiratesByCell();
  const ships = shipsByCell();
  const labels = buildPirateLabels();
  const movable = movablePirateIds();
  const frag = document.createDocumentFragment();

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
        node.classList.add(extraTargetClass);
      } else if (here && here.some((p) => movable.has(p.id))) {
        node.classList.add("pickable");
      }

      node.addEventListener("click", (event) => {
        app.lastHandledEvent = event;
        handleClick(r, c, null);
      });
      frag.appendChild(node);
    }
  }

  el.board.appendChild(frag);
}

function cellTitle(cell) {
  if (!cell || !cell.open) return "Закрытая клетка — откроется, когда на неё ступит пират";

  let text = TYPE_NAME[cell.type] || cell.type;

  if (cell.type === "arrow" && Array.isArray(cell.dirs) && cell.dirs.length > 0) {
    const names = cell.dirs.map((d) => DIR_NAME[dirKey(d)] || "?").join(", ");
    text += ": " + names;
  }
  if (cell.type === "cannon" && Array.isArray(cell.dir)) {
    text += ": выстрел " + (DIR_NAME[dirKey(cell.dir)] || "?");
  }
  if (typeof cell.steps === "number" && cell.steps > 0) {
    text += ", уровней: " + cell.steps;
  }
  if (typeof cell.coins === "number" && cell.coins > 0) {
    text += ", монет: " + cell.coins;
  }
  return text;
}

function fillCell(node, cell) {
  if (!cell || !cell.open) {
    node.classList.add("closed");
    node.title = cellTitle(cell);
    return;
  }

  if (cell.type === "sea") {
    node.classList.add("sea");
    node.title = TYPE_NAME.sea;
    return;
  }

  node.classList.add("open", "t-" + cell.type);
  node.title = cellTitle(cell);

  if (cell.type === "arrow") {
    node.appendChild(makeArrows(Array.isArray(cell.dirs) ? cell.dirs : []));
  } else if (cell.type === "cannon") {
    node.appendChild(makeCannon(cell.dir));
  } else if (TYPE_ICON[cell.type]) {
    node.appendChild(iconSvg(TYPE_ICON[cell.type], "ic"));
  }

  if (typeof cell.steps === "number" && cell.steps > 0 && MAZE_TYPES.has(cell.type)) {
    const steps = document.createElement("div");
    steps.className = "chip-steps";
    steps.textContent = String(cell.steps);
    node.appendChild(steps);
  }

  // Монеты бывают на любой открытой клетке — счётчик рисуем всегда.
  if (typeof cell.coins === "number" && cell.coins > 0) {
    const coins = document.createElement("div");
    coins.className = "chip-coins";
    coins.textContent = String(cell.coins);
    node.appendChild(coins);
  }
}

function makeArrows(dirs) {
  const root = svgNode("svg", { class: "ic", viewBox: "0 0 24 24" });
  for (const dir of dirs) {
    const angle = ANGLE_UP[dirKey(dir)];
    if (angle === undefined) continue;
    root.appendChild(useNode("i-arrow", { transform: "rotate(" + angle + " 12 12)" }));
  }
  if (!root.firstChild) root.appendChild(useNode("i-arrow"));
  return root;
}

function makeCannon(dir) {
  const root = svgNode("svg", { class: "ic", viewBox: "0 0 24 24" });
  const angle = Array.isArray(dir) ? ANGLE_RIGHT[dirKey(dir)] : undefined;
  root.appendChild(
    useNode("i-cannon", angle === undefined ? null : { transform: "rotate(" + angle + " 12 12)" }),
  );
  return root;
}

function makeShip(team, r, c) {
  const meta = TEAMS[team.id] || { name: String(team.id), letter: "?", color: "#888" };

  const node = document.createElement("div");
  node.className = "ship";

  const root = svgNode("svg", { viewBox: "0 0 32 32" });
  root.style.color = meta.color;
  root.appendChild(useNode("i-ship"));

  const letter = svgNode("text", { x: "20.6", y: "16.4", class: "ship-letter" });
  letter.textContent = meta.letter;
  root.appendChild(letter);
  node.appendChild(root);

  if (team.delivered > 0) {
    const chip = document.createElement("span");
    chip.className = "deliv";
    chip.textContent = String(team.delivered);
    node.appendChild(chip);
  }

  node.title =
    "Корабль команды " + meta.name + " (игрок " + team.owner + "), доставлено монет: " +
    (team.delivered || 0);

  node.addEventListener("click", (event) => {
    event.stopPropagation();
    app.lastHandledEvent = event;
    handleClick(r, c, { kind: "ship" });
  });
  return node;
}

// Форма токена — второй, нецветовой признак команды.
function teamShapeNode(teamId) {
  const shape = (TEAMS[teamId] || {}).shape;
  if (shape === "square") {
    return svgNode("rect", { class: "tok-shape", x: 4.5, y: 4.5, width: 23, height: 23, rx: 3 });
  }
  if (shape === "diamond") {
    return svgNode("path", { class: "tok-shape", d: "M16 3 29 16 16 29 3 16Z" });
  }
  if (shape === "hex") {
    return svgNode("path", { class: "tok-shape", d: "M16 3.4 27 9.7v12.6L16 28.6 5 22.3V9.7Z" });
  }
  return svgNode("circle", { class: "tok-shape", cx: 16, cy: 16, r: 12 });
}

// Маленький значок команды для панели: та же форма и тот же цвет, что на поле.
function teamMark(teamId) {
  const root = svgNode("svg", { class: "mark team-" + teamId, viewBox: "0 0 32 32" });
  root.appendChild(teamShapeNode(teamId));
  return root;
}

function makeTokens(list, labels, movable, r, c) {
  const box = document.createElement("div");
  box.className = "tokens";

  for (const pirate of list) {
    const wrap = document.createElement("div");
    wrap.className = "tok team-" + pirate.team;

    const root = svgNode("svg", { viewBox: "0 0 32 32" });
    root.appendChild(teamShapeNode(pirate.team));

    const num = svgNode("text", { x: 16, y: 21, class: "tok-num" });
    num.textContent = String(labels.get(pirate.id) || "?");
    root.appendChild(num);

    if (pirate.coin) {
      root.appendChild(svgNode("circle", { class: "tok-coin", cx: 25.5, cy: 6.5, r: 5.6 }));
      root.appendChild(svgNode("circle", { class: "tok-coin-in", cx: 25.5, cy: 6.5, r: 2.6 }));
    }
    if (pirate.trapped) {
      root.appendChild(svgNode("circle", { class: "pip pip-trap", cx: 6, cy: 26, r: 4.6 }));
    }
    if (pirate.skipTurns > 0) {
      root.appendChild(svgNode("circle", { class: "pip pip-rest", cx: 26, cy: 26, r: 4.6 }));
    }

    wrap.appendChild(root);

    // Уровень лабиринта обязан быть виден: без него нельзя понять, кого можно выбить.
    const level = mazeLabel(pirate);
    if (level) {
      const chip = document.createElement("span");
      chip.className = "lvl";
      chip.textContent = level;
      wrap.appendChild(chip);
    }

    if (movable.has(pirate.id)) wrap.classList.add("movable");
    if (app.selection && app.selection.kind === "pirate" && app.selection.id === pirate.id) {
      wrap.classList.add("selected");
    }
    if (pirate.trapped) wrap.classList.add("trapped");
    if (pirate.skipTurns > 0) wrap.classList.add("resting");

    wrap.title = pirateTitle(pirate, labels);

    wrap.addEventListener("click", (event) => {
      event.stopPropagation();
      app.lastHandledEvent = event;
      handleClick(r, c, { kind: "pirate", id: pirate.id });
    });

    box.appendChild(wrap);
  }

  return box;
}

function pirateName(pirate, labels) {
  return "пират " + (labels.get(pirate.id) || "?") + " · " + (TEAM_NAMES[pirate.team] || pirate.team);
}

function pirateTitle(pirate, labels) {
  const parts = [pirateName(pirate, labels)];
  if (pirate.dead) parts.push("погиб");
  if (pirate.coin) parts.push("несёт монету");
  if (pirate.trapped) parts.push("в капкане");
  const level = mazeLabel(pirate);
  if (level) parts.push("лабиринт " + level);
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
  renderTeams();
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
    const value = Number(score[side]) || 0;

    const chip = document.createElement("div");
    chip.className = "chip" + (you === side ? " you" : "");

    const big = document.createElement("b");
    big.textContent = String(value);
    chip.appendChild(big);

    const who = document.createElement("div");
    who.className = "who";
    who.textContent = "Игрок " + side + (you === side ? " · вы" : "");
    chip.appendChild(who);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = Math.max(0, Math.min(100, (value / GOAL) * 100)) + "%";
    bar.appendChild(fill);
    chip.appendChild(bar);

    chip.title = "Доставлено монет: " + value + " из " + GOAL;
    el.score.appendChild(chip);
  }
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
  line.className = "line";
  line.appendChild(teamMark(app.view.activeTeam));
  line.appendChild(
    document.createTextNode(
      "Ходит " + (TEAM_NAMES[app.view.activeTeam] || app.view.activeTeam) +
      (team ? " · игрок " + team.owner : ""),
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

  el.whoami.appendChild(document.createTextNode("Вы играете за " + app.view.you + ":"));
  const mine = app.view.teams.filter((t) => t.owner === app.view.you);
  mine.forEach((team) => {
    const span = document.createElement("span");
    span.style.display = "inline-flex";
    span.style.alignItems = "center";
    span.style.gap = "5px";
    span.appendChild(teamMark(team.id));
    span.appendChild(document.createTextNode(TEAM_NAMES[team.id] || String(team.id)));
    el.whoami.appendChild(span);
  });
}

function renderTeams() {
  el.teams.textContent = "";
  if (!app.view || !Array.isArray(app.view.teams)) return;

  for (const team of app.view.teams) {
    const meta = TEAMS[team.id] || { name: String(team.id), letter: "?" };
    const row = document.createElement("div");
    row.className = "row";
    if (team.id === app.view.activeTeam) row.classList.add("active");
    if (app.view.you !== "spectator" && team.owner === app.view.you) row.classList.add("mine");

    row.appendChild(teamMark(team.id));

    const name = document.createElement("span");
    name.className = "nm";
    name.textContent = meta.name + " «" + meta.letter + "»";
    row.appendChild(name);

    const own = document.createElement("span");
    own.className = "own";
    own.textContent = "игрок " + team.owner;
    row.appendChild(own);

    const cnt = document.createElement("span");
    cnt.className = "cnt";
    cnt.appendChild(iconSvg("i-coin", "ic"));
    cnt.appendChild(document.createTextNode(String(team.delivered || 0)));
    cnt.title = "Монет доставлено этим кораблём";
    row.appendChild(cnt);

    el.teams.appendChild(row);
  }
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

  const labels = buildPirateLabels();

  if (app.selection && app.selection.kind === "pirate") {
    const pirate = pirateById(app.selection.id);
    if (pirate) {
      const info = document.createElement("span");
      info.className = "sel";
      info.appendChild(teamMark(pirate.team));
      info.appendChild(document.createTextNode("Выбран " + pirateName(pirate, labels)));
      el.controls.appendChild(info);

      const maze = mazeActionFor(pirate.id);
      if (maze) {
        const level = mazeLabel(pirate);
        const button = document.createElement("button");
        button.className = "small primary";
        button.textContent = "Пробиваться дальше" + (level ? " (" + level + ")" : "");
        button.title = "Пират продвигается на следующий уровень лабиринта";
        button.addEventListener("click", () => sendAction(maze));
        el.controls.appendChild(button);
      } else if (targetsForSelection().size === 0) {
        const none = document.createElement("span");
        none.className = "sel";
        none.textContent = "ходов у этого пирата нет";
        el.controls.appendChild(none);
      }
    }
  } else if (app.selection && app.selection.kind === "ship") {
    const info = document.createElement("span");
    info.className = "sel";
    info.textContent = "Выбран корабль — укажите клетку у берега";
    el.controls.appendChild(info);
  } else {
    // Пират в глубине лабиринта не подсвечивает ни одной клетки,
    // поэтому его единственный ход выносим прямо в панель.
    for (const action of mazeActions()) {
      const pirate = pirateById(action.pirate);
      const level = mazeLabel(pirate);
      const button = document.createElement("button");
      button.className = "small";
      button.textContent =
        "Пробиваться дальше" + (level ? " " + level : "") +
        (pirate ? " · " + pirateName(pirate, labels) : "");
      button.addEventListener("click", () => sendAction(action));
      el.controls.appendChild(button);
    }
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
    el.banner.className = "banner hidden";
    el.banner.textContent = "";
    return;
  }

  const winner = app.view.winner;
  let text;
  let mood = "";
  if (winner === null || winner === undefined) {
    text = "Ничья — сокровища поделены поровну";
  } else {
    text = "Победил игрок " + winner;
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

  el.conn.className = "conn " + app.connStatus;
  el.conn.textContent = "";
  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = "currentColor";
  el.conn.appendChild(dot);
  el.conn.appendChild(
    document.createTextNode("Связь: " + (labels[app.connStatus] || app.connStatus)),
  );
}

function renderStatuses() {
  el.statuses.textContent = "";
  if (!app.view) return;

  const labels = buildPirateLabels();
  const notable = app.view.pirates.filter(
    (p) => p.dead || p.trapped || p.coin || p.skipTurns > 0 || mazeLabel(p),
  );

  if (notable.length === 0) {
    const item = document.createElement("li");
    item.textContent = "все пираты в порядке";
    el.statuses.appendChild(item);
    return;
  }

  for (const pirate of notable) {
    const item = document.createElement("li");
    item.appendChild(teamMark(pirate.team));

    const name = document.createElement("b");
    name.textContent = "№" + (labels.get(pirate.id) || "?") + " " + (TEAM_NAMES[pirate.team] || "");
    item.appendChild(name);

    const notes = [];
    if (pirate.dead) notes.push("погиб");
    if (pirate.coin) notes.push("с монетой");
    if (pirate.trapped) notes.push("в капкане");
    const level = mazeLabel(pirate);
    if (level) notes.push("лабиринт " + level);
    if (pirate.skipTurns > 0) notes.push("пропуск ходов: " + pirate.skipTurns);
    if (pirate.place === "sea") notes.push("в воде");

    item.appendChild(document.createTextNode("— " + notes.join(", ")));
    el.statuses.appendChild(item);
  }
}

function renderLog() {
  el.log.textContent = "";
  if (!app.view || !Array.isArray(app.view.log) || app.view.log.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "пока ничего не произошло";
    el.log.appendChild(item);
    return;
  }
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

  // Декорации поля (лист острова и роза ветров) живут в разметке —
  // перерисовка клеток не должна их терять.
  el.boardDecor = Array.from(el.board.children);

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
  el.teams = byId("teams");
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
