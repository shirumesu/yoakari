// Falling sakura petals on a fixed canvas. The canvas survives page swaps (transition:persist),
// so this starts once per visit.
type Petal = { x: number; y: number; s: number; vy: number; vx: number; rot: number; vr: number; flip: number; vf: number; sway: number; ph: number; a: number };

export function startPetals() {
  const canvas = document.getElementById('yk-petals') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('yoakari: 2d canvas context unavailable');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let petals: Petal[] = [];
  let raf = 0;
  let W = 0;
  let H = 0;

  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const spawn = (init: boolean): Petal => ({
    x: rnd(-40, W), y: init ? rnd(-H, H) : rnd(-60, -20), s: rnd(7, 13), vy: rnd(0.35, 0.9), vx: rnd(0.2, 0.7),
    rot: rnd(0, 6.28), vr: rnd(-0.02, 0.02), flip: rnd(0, 6.28), vf: rnd(0.015, 0.04), sway: rnd(0.6, 1.6), ph: rnd(0, 6.28), a: rnd(0.55, 0.9),
  });
  const resize = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth;
    H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const path = (s: number) => {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.9, -s * 0.7, s * 0.75, s * 0.55, 0, s);
    ctx.bezierCurveTo(-s * 0.75, s * 0.55, -s * 0.9, -s * 0.7, 0, -s);
    ctx.moveTo(-s * 0.18, -s);
    ctx.lineTo(0, -s * 0.72);
    ctx.lineTo(s * 0.18, -s);
  };
  const frame = (t: number) => {
    ctx.clearRect(0, 0, W, H);
    const hue = getComputedStyle(document.documentElement).getPropertyValue('--h').trim();
    for (const p of petals) {
      p.y += p.vy;
      p.x += p.vx + Math.sin(t / 1600 + p.ph) * p.sway * 0.3;
      p.rot += p.vr;
      p.flip += p.vf;
      if (p.y > H + 30 || p.x > W + 40) Object.assign(p, spawn(false));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(Math.cos(p.flip), 1);
      const g = ctx.createLinearGradient(0, -p.s, 0, p.s);
      g.addColorStop(0, `oklch(.95 .03 ${hue} / ${p.a})`);
      g.addColorStop(1, `oklch(.85 .07 ${hue} / ${p.a})`);
      ctx.fillStyle = g;
      path(p.s);
      ctx.fill();
      ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  const run = (on: boolean) => {
    cancelAnimationFrame(raf);
    raf = 0;
    ctx.clearRect(0, 0, W, H);
    if (!on || reduce.matches) return;
    const n = W < 700 ? 12 : 24;
    if (petals.length !== n) petals = Array.from({ length: n }, () => spawn(true));
    raf = requestAnimationFrame(frame);
  };
  resize();
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => run(!document.hidden));
  reduce.addEventListener('change', () => run(!document.hidden));
  run(true);
}
