// Browser behaviour of the theme. Bundled once; per-page parts re-run on every `astro:page-load`
// (Astro's ClientRouter swaps the page without reloading this module).
import { startPetals } from './petals.ts';

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string) => [...document.querySelectorAll<T>(s)];

/* ---------- light / dark: the head script sets data-theme / data-dark; the button flips and remembers ---------- */
const THEME_KEY = 'yoakari-theme';
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
darkMQ.addEventListener('change', () => {
  if (!root.dataset.theme) root.dataset.dark = darkMQ.matches ? '1' : '0';
});
function toggleTheme() {
  const next = root.dataset.dark === '1' ? 'light' : 'dark';
  const flip = () => {
    root.dataset.theme = next;
    root.dataset.dark = next === 'dark' ? '1' : '0';
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this page view only */
    }
    document.dispatchEvent(new CustomEvent('yoakari:theme'));
  };
  if (document.startViewTransition && !reduce.matches) document.startViewTransition(flip);
  else flip();
}

/* ---------- clicks: theme, search, drawer ---------- */
document.addEventListener('click', (e) => {
  const t = e.target as Element;
  if (t.closest('[data-yk-theme]')) return toggleTheme();
  const opener = t.closest<HTMLElement>('[data-yk-open]');
  if (opener?.dataset.ykOpen === 'search') {
    closeDrawer();
    document.dispatchEvent(new CustomEvent('yoakari:search'));
    return;
  }
  if (opener?.dataset.ykOpen === 'drawer') {
    $('#yk-drawer')!.hidden = false;
    return;
  }
  const drawer = $('#yk-drawer');
  if (drawer && !drawer.hidden && (t === drawer || t.closest('#yk-drawer a'))) closeDrawer();
});
function closeDrawer() {
  const d = $('#yk-drawer');
  if (d) d.hidden = true;
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

/* ---------- scroll: navbar capsule, hide on the way down, reading progress, back to top ---------- */
const scrollTimeline = CSS.supports('animation-timeline: scroll()');
let ticking = false;
let lastY = scrollY;
function onScroll() {
  ticking = false;
  const nav = $('#yk-nav');
  if (!nav) return;
  const y = scrollY;
  const dy = y - lastY;
  if (y < 80) {
    nav.classList.remove('hide');
    lastY = y;
  } else if (Math.abs(dy) > 8) {
    nav.classList.toggle('hide', dy > 0);
    lastY = y;
  }
  nav.classList.toggle('scrolled', y > 40);
  const bar = $('#yk-progress')!;
  bar.classList.toggle('show', y > 40);
  const max = root.scrollHeight - innerHeight;
  bar.style.setProperty('--p', String(max > 0 ? Math.min(1, y / max) : 0));
  $('#yk-top')?.classList.toggle('show', y > 600);
  if (!scrollTimeline) $('#yk-hero')?.style.setProperty('--out', Math.min(1, y / (innerHeight * 0.5)).toFixed(3));
}
addEventListener('scroll', () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(onScroll);
  }
}, { passive: true });
document.addEventListener('click', (e) => {
  if ((e.target as Element).closest('#yk-top')) scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
});

/* ---------- per page ---------- */
let cleanups: Array<() => void> = [];
document.addEventListener('astro:before-swap', () => {
  for (const c of cleanups) c();
  cleanups = [];
});
document.addEventListener('astro:page-load', () => {
  lastY = scrollY;
  onScroll();
  closeDrawer();
  cleanups.push(typewriter(), toc(), uptime(), mermaid());
});

/* typewriter under the home title */
function typewriter() {
  const el = $('[data-yk-motto]');
  if (!el || reduce.matches) return () => {};
  const lines: string[] = JSON.parse(el.dataset.ykMotto!);
  if (lines.length < 2) return () => {};
  let line = 0;
  let chars = lines[0].length;
  let deleting = true;
  let timer = 0;
  const tick = () => {
    if (deleting) {
      chars--;
      if (chars <= 0) {
        deleting = false;
        line = (line + 1) % lines.length;
      }
    } else {
      chars++;
      if (chars >= lines[line].length) {
        deleting = true;
        el.textContent = lines[line];
        timer = window.setTimeout(tick, 3200);
        return;
      }
    }
    el.textContent = lines[line].slice(0, Math.max(0, chars)) || '​';
    timer = window.setTimeout(tick, deleting ? 55 : 120);
  };
  timer = window.setTimeout(tick, 3200);
  return () => clearTimeout(timer);
}

/* table of contents: a flower slides along the rail to the section being read; h3 grows a little branch */
function toc() {
  const tocs = $$('[data-yk-toc]');
  const heads = $$('.prose h2[id], .prose h3[id]').filter((h) => tocs[0]?.querySelector(`[data-target="${CSS.escape(h.id)}"]`));
  if (!tocs.length || !heads.length) return () => {};
  let active = heads[0].id;
  const place = (t: HTMLElement) => {
    const links = [...t.querySelectorAll<HTMLAnchorElement>('a')];
    const a = links.find((x) => x.dataset.target === active);
    if (!a) return;
    const y = a.offsetTop + a.offsetHeight / 2 - 8;
    const lv3 = a.classList.contains('lv3');
    t.style.setProperty('--my', `${y}px`);
    t.style.setProperty('--mx', lv3 ? '15px' : '0px');
    t.style.setProperty('--bw', lv3 ? '14px' : '0px');
    t.style.setProperty('--mr', `${links.indexOf(a) * 72}deg`);
    t.style.setProperty('--fill', `${y + 8}px`);
  };
  const setActive = (id: string) => {
    active = id;
    for (const a of $$<HTMLAnchorElement>('[data-yk-toc] a')) a.classList.toggle('active', a.dataset.target === id);
    tocs.forEach(place);
  };
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) setActive(en.target.id);
  }, { rootMargin: '-80px 0px -70% 0px' });
  heads.forEach((h) => io.observe(h));
  setActive(active);
  const details = $('.toc-mobile');
  const onToggle = () => tocs.forEach(place);
  details?.addEventListener('toggle', onToggle);
  const onClick = (e: Event) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('[data-yk-toc] a');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.target!)?.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' });
    history.replaceState(history.state, '', `#${a.dataset.target}`);
    const d = a.closest('details');
    if (d) d.open = false;
  };
  document.addEventListener('click', onClick);
  return () => {
    io.disconnect();
    details?.removeEventListener('toggle', onToggle);
    document.removeEventListener('click', onClick);
  };
}

/* "running for N days" in the footer */
function uptime() {
  const el = $('[data-yk-since]');
  if (el) el.textContent = String(Math.floor((Date.now() - new Date(el.dataset.ykSince!).getTime()) / 864e5));
  return () => {};
}

/* Mermaid diagrams: the library is only downloaded on pages that have one */
function mermaid() {
  const blocks = $$('pre.mermaid');
  if (!blocks.length) return () => {};
  const sources = blocks.map((b) => b.dataset.src ?? b.textContent ?? '');
  blocks.forEach((b, i) => (b.dataset.src = sources[i]));
  const render = async () => {
    const { default: m } = await import('mermaid');
    m.initialize({ startOnLoad: false, theme: root.dataset.dark === '1' ? 'dark' : 'neutral', fontFamily: 'inherit' });
    for (const [i, b] of blocks.entries()) {
      b.removeAttribute('data-processed');
      b.textContent = sources[i];
    }
    await m.run({ nodes: blocks });
    for (const b of blocks) b.dataset.done = '';
  };
  render();
  document.addEventListener('yoakari:theme', render);
  return () => document.removeEventListener('yoakari:theme', render);
}

startPetals();
