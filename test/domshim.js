// Минимальный DOM, достаточный чтобы прогнать клиент «Шакала» без браузера.
import { readFileSync } from "node:fs";

class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...n) { n.forEach((x) => x && this.set.add(x)); this.sync(); }
  remove(...n) { n.forEach((x) => this.set.delete(x)); this.sync(); }
  contains(n) { return this.set.has(n); }
  toggle(n, on) { if (on === undefined) on = !this.set.has(n); on ? this.add(n) : this.remove(n); return on; }
  sync() { this.el._className = [...this.set].join(" "); }
}

class El {
  constructor(tag, ns) {
    this.tagName = String(tag).toUpperCase();
    this.namespaceURI = ns ?? null;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attrs = new Map();
    this.listeners = new Map();
    this._className = "";
    this._text = "";
    this.value = "";
    this.title = "";
    this.id = "";
    this.classList = new ClassList(this);
  }
  get className() { return this._className; }
  set className(v) {
    this._className = String(v ?? "");
    this.classList.set = new Set(this._className.split(/\s+/).filter(Boolean));
  }
  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent ?? "").join("");
  }
  set textContent(v) { this._text = String(v ?? ""); this.children = []; }
  appendChild(c) { if (!c) return c; c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(typeof c === "string" ? new Text(c) : c)); }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  remove() { this.parentNode?.removeChild(this); }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
    if (k === "id") this.id = String(v);
    if (k === "class") this.className = v;
  }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, event = {}) {
    const ev = { type, target: this, stopPropagation() {}, preventDefault() {}, ...event };
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
    return ev;
  }
  descendants() {
    const out = [];
    const walk = (n) => { for (const c of n.children) { out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  matches(sel) {
    const m = /^\[data-cell="([^"]+)"\]$/.exec(sel);
    if (m) return this.dataset.cell === m[1];
    if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
    return false;
  }
  querySelector(sel) { return this.descendants().find((n) => n.matches?.(sel)) ?? null; }
  querySelectorAll(sel) { return this.descendants().filter((n) => n.matches?.(sel)); }
  contains(n) { return n === this || this.descendants().includes(n); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 }; }
  focus() {} select() {}
}

class Text extends El {
  constructor(t) { super("#text"); this._text = String(t); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
}

export function installDom(htmlPath, { search = "" } = {}) {
  const html = readFileSync(htmlPath, "utf8");
  const registry = new Map();
  for (const m of html.matchAll(/id="([^"]+)"/g)) {
    const el = new El("div");
    el.id = m[1];
    registry.set(m[1], el);
  }

  const body = new El("body");
  const doc = {
    body,
    createElement: (t) => new El(t),
    createElementNS: (ns, t) => new El(t, ns),
    createTextNode: (t) => new Text(t),
    createDocumentFragment: () => new El("fragment"),
    getElementById: (id) => registry.get(id) ?? null,
    addEventListener: (t, fn) => body.addEventListener(t, fn),
    execCommand: () => true,
  };

  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      sockets.push(this);
    }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; }
    deliver(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  }

  globalThis.document = doc;
  globalThis.window = {
    addEventListener: () => {},
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) % 256; return a; } },
    innerWidth: 1400,
    innerHeight: 900,
  };
  globalThis.location = { origin: "https://test.local", pathname: "/", search, protocol: "https:", host: "test.local" };
  globalThis.history = { replaceState: () => {} };
  globalThis.localStorage = {
    map: new Map(),
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; },
    setItem(k, v) { this.map.set(k, String(v)); },
  };
  // В Node 22 navigator — свойство только на чтение, поэтому переопределяем явно.
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: () => Promise.resolve() } },
    configurable: true,
    writable: true,
  });
  globalThis.WebSocket = FakeSocket;

  return { registry, sockets, body };
}
