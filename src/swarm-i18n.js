/* antigravity-zh: Swarm Board sidecar iframe UI translation layer.
 * Executed only inside loopback iframes that render [data-testid="swarm-board"].
 * Display only: translates Swarm UI chrome while skipping user/agent posts,
 * swarm titles, member names, task titles/briefs, and raw JSON.
 */
(function agyZhSwarmI18n() {
  'use strict';
  if (typeof document === 'undefined' || !document.querySelector('[data-testid="swarm-board"]')) return;
  if (globalThis.__agyZhSwarmInstalled) return;
  globalThis.__agyZhSwarmInstalled = true;

  const DICT = /*@AGY_ZH_SWARM_DICT@*/ { entries: {} };
  const exact = new Map();
  const templates = [];
  const PH = /\{(\d+)\}/g;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  for (const [en, zh] of Object.entries(DICT.entries || {})) {
    if (typeof zh !== 'string' || !zh) continue;
    if (/\{\d+\}/.test(en)) {
      const trimmed = norm(en);
      const order = [];
      let src = '';
      let last = 0;
      trimmed.replace(PH, (m, n, off) => {
        src += escapeRe(trimmed.slice(last, off)) + '([\\s\\S]+?)';
        order.push(Number(n));
        last = off + m.length;
        return m;
      });
      src += escapeRe(trimmed.slice(last));
      const literal = trimmed.replace(PH, '').length;
      const chunks = trimmed.split(PH).filter((_, i) => i % 2 === 0);
      const needle = chunks.reduce((a, b) => (b.length > a.length ? b : a), '').trim();
      templates.push({ re: new RegExp('^' + src + '$'), order, zh, literal, needle });
    } else {
      exact.set(norm(en), zh);
    }
  }
  templates.sort((a, b) => b.literal - a.literal);

  function translateCore(text) {
    const key = norm(text);
    if (!key || !/[A-Za-z]/.test(key)) return null;
    const hit = exact.get(key);
    if (hit !== undefined) return hit;
    if (templates.length === 0 || key.length > 400) return null;
    for (const t of templates) {
      if (t.needle && !key.includes(t.needle)) continue;
      const m = t.re.exec(key);
      if (!m) continue;
      const vals = [];
      for (let i = 0; i < t.order.length; i++) vals[t.order[i]] = m[i + 1];
      return t.zh.replace(PH, (_, n) => (vals[Number(n)] !== undefined ? vals[Number(n)] : ''));
    }
    return null;
  }

  function translate(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    const out = translateCore(text);
    if (out === null) return null;
    const lead = /^\s*/.exec(text)[0];
    const trail = /\s*$/.exec(text)[0];
    return lead + out + trail;
  }

  // Never translate user/agent-authored content: swarm title, raw JSON, board posts,
  // member names, task titles/notes, or coordinator briefs.
  const SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'textarea', 'input', 'code', 'pre', 'kbd', 'samp',
    '#swarm-title', '#raw', '.msg-body', '.msg-author', '.chip-name', '.node-label', '.hv-n',
    '.o2-goal > b', '.o2-goal > p', '.o2-lb > p', '.o2-askb > b', '.o2-askl',
    '.o2-m[data-o2who]:not([data-o2who=""])',
    '[data-testid="swarm-message-channel"]',
  ].join(',');

  const written = new WeakMap();
  const orig = new WeakMap();
  const originalOf = (n) => (written.has(n) && written.get(n) === n.nodeValue ? orig.get(n) : n.nodeValue);
  function setText(n, original, out) {
    orig.set(n, original);
    written.set(n, out);
    if (n.nodeValue !== out) n.nodeValue = out;
  }

  function isSkipped(el) {
    return !el || el.nodeType !== 1 || Boolean(el.closest(SKIP_SELECTOR));
  }

  function tryGroup(el) {
    const kids = el.childNodes;
    if (kids.length < 2 || kids.length > 8) return false;
    for (const k of kids) if (k.nodeType !== 3) return false;
    const originals = Array.from(kids, originalOf);
    const joined = originals.join('');
    const out = joined.length <= 400 && /[A-Za-z]/.test(joined) ? translate(joined) : null;
    if (out === null) return false;
    Array.from(kids).forEach((k, i) => setText(k, originals[i], i === 0 ? out : ''));
    return true;
  }

  function doText(node) {
    const parent = node.parentElement;
    if (isSkipped(parent)) return;
    const v = node.nodeValue;
    if (!v || v.length > 400 || !/[A-Za-z]/.test(v)) return;
    if (written.has(node) && written.get(node) === v) return;
    if (tryGroup(parent)) return;
    const out = translate(v);
    if (out !== null && out !== v) setText(node, v, out);
  }

  const ATTRS = ['placeholder', 'title'];
  function doAttrs(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.closest('#swarm-title, #raw, .msg-body')) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !/[A-Za-z]/.test(v)) continue;
      const out = translate(v);
      if (out !== null && out !== v) el.setAttribute(a, out);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      doText(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (root.hasAttribute('placeholder') || root.hasAttribute('title')) doAttrs(root);
      if (root.closest(SKIP_SELECTOR)) return;
    }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) doText(n);
    if (root.querySelectorAll) {
      for (const el of root.querySelectorAll('[placeholder],[title]')) doAttrs(el);
    }
  }

  function onMutations(records) {
    for (const r of records) {
      if (r.type === 'characterData') {
        doText(r.target);
      } else if (r.type === 'childList') {
        for (const n of r.addedNodes) walk(n);
      } else if (r.type === 'attributes' && r.target.nodeType === 1) {
        doAttrs(r.target);
      }
    }
  }

  function start() {
    const root = document.documentElement || document;
    walk(root);
    new MutationObserver(onMutations).observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  try {
    if (document.documentElement) start();
    else document.addEventListener('readystatechange', start, { once: true });
  } catch (e) {
    console.warn('[antigravity-zh] swarm translation disabled:', e);
  }
})();
