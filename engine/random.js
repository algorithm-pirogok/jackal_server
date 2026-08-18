// Детерминированный ГПСЧ (mulberry32). Движок не имеет права на Math.random():
// раскладка поля должна воспроизводиться по сиду, иначе партию не переиграть
// и не воспроизвести баг.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Тасование Фишера-Йейтса. Возвращает новый массив, исходный не трогает.
export function shuffle(rng, array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
