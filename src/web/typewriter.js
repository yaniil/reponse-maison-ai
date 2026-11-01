// Lisse l'affichage d'un texte qui arrive par paquets : effet « machine à écrire » régulier.
export function createTypewriter(paint) {
  let target = '';
  let shown = 0;
  let raf = 0;
  let waiters = [];
  const hasRaf = typeof requestAnimationFrame === 'function';
  const schedule = (fn) => (hasRaf ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  const cancel = (id) => (hasRaf ? cancelAnimationFrame(id) : clearTimeout(id));
  const tick = () => {
    if (shown < target.length) {
      const step = Math.max(1, Math.ceil((target.length - shown) / 9));
      shown = Math.min(target.length, shown + step);
      paint(target.slice(0, shown));
    }
    if (shown >= target.length && waiters.length) { const w = waiters; waiters = []; w.forEach((f) => f()); }
    raf = schedule(tick);
  };
  raf = schedule(tick);
  return {
    set(t) {
      const next = String(t || '');
      if (!next.startsWith(target.slice(0, shown))) shown = 0;
      target = next;
      if (!next) paint('');
    },
    flush(maxMs = 1800) {
      return new Promise((res) => {
        if (shown >= target.length) { res(); return; }
        waiters.push(res);
        setTimeout(res, maxMs);
      });
    },
    stop() { cancel(raf); },
  };
}
