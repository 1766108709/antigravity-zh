/* antigravity-zh: hub UI translation layer.
 * Appended to dist/preload.js by scripts/apply.mjs. The hub page is served by
 * language_server.exe (https://127.0.0.1:<port>/), so its JS bundle cannot be
 * edited on disk; instead this code runs in the preload (isolated world) and
 * rewrites displayed text nodes and placeholder/title attributes in place.
 * Display only: it never changes aria-label, values sent over IPC, or any
 * application state. The dictionary JSON is inlined by scripts/apply.mjs.
 */
(function agyZhHubI18n() {
  'use strict';
  if (globalThis.__agyZhInstalled) return;
  globalThis.__agyZhInstalled = true;

  const DICT = /*@AGY_ZH_DICT@*/ { entries: {} };
  const exact = new Map();
  const templates = [];
  const PH = /\{(\d+)\}/g;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  for (const [en, zh] of Object.entries(DICT.entries)) {
    if (typeof zh !== 'string' || !zh) continue;
    if (/\{\d+\}/.test(en)) {
      const order = [];
      let src = '';
      let last = 0;
      en.replace(PH, (m, n, off) => {
        src += escapeRe(en.slice(last, off)) + '([\\s\\S]+?)';
        order.push(Number(n));
        last = off + m.length;
        return m;
      });
      src += escapeRe(en.slice(last));
      // Allow an empty capture for plural suffixes such as "tool{1}" -> "tool" / "tools".
      src = src.replace(/([A-Za-z])\(\[\\s\\S\]\+\?\)/g, '$1([\\s\\S]*?)');
      const literalText = en.replace(PH, '');
      // Too little fixed text would match arbitrary strings (e.g. "({0})").
      if ((literalText.match(/[A-Za-z]/g) || []).length < 3) continue;
      const chunks = en.split(PH).filter((_, i) => i % 2 === 0);
      const needle = chunks.reduce((a, b) => (b.length > a.length ? b : a), '').trim();
      templates.push({ re: new RegExp('^' + src + '$'), order, zh, literal: literalText.length, needle });
    } else {
      exact.set(norm(en), zh);
    }
  }
  templates.sort((a, b) => b.literal - a.literal);

  // Runtime values inside templates: exact dictionary hit, or a plain duration
  // such as "6 days, 22 hours" -> "6 天 22 小时".
  const UNITS = { year: '年', month: '个月', week: '周', day: '天', hour: '小时', minute: '分钟', min: '分钟', second: '秒', sec: '秒' };
  function localizeValue(v) {
    const sub = exact.get(norm(v));
    if (sub !== undefined) return sub;
    const d = v.replace(/\b(\d+)\s*(year|month|week|day|hour|minute|min|second|sec)s?\b/gi, (_, n, u) => `${n} ${UNITS[u.toLowerCase()]}`)
      .replace(/\s*(,|\band\b)\s*/g, ' ').trim();
    return /[A-Za-z]/.test(d) ? v : d;
  }

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
      t.order.forEach((n, i) => {
        vals[n] = localizeValue(m[i + 1]);
      });
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

  // Content the user or the model wrote, code, and editors are never touched.
  const SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'textarea', 'input', 'code', 'pre', 'kbd', 'samp', 'svg',
    '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
    '.xterm', '.monaco-editor', '.cm-editor', '[role="treeitem"]', '[data-agy-zh-skip]',
    '[data-testid="user-message-content"]', '[data-testid="user-message-bubble"]',
    '[data-testid="transcript-line-text"]', '[data-testid="live-transcript"]',
    '[data-testid="automation-instructions-markdown"]', '[data-testid="commentable-content"]',
    '[data-testid="sidecar-logs-content"]', '[data-testid="markdown-code-block-preview"]',
    '[data-testid="file-title-name"]', '[data-testid="breadcrumb-segment"]',
    '[data-testid="webview-download-filename"]', '[data-testid="ssh-config-file-name"]',
    '[data-testid="csv-file-viewer"]', '[data-testid="terminal-surface"]',
  ].join(',');
  const MARKDOWN_BLOCK = 'p,li,td,th,blockquote,h1,h2,h3,h4,h5,h6,dd,dt';

  function skipped(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest(SKIP_SELECTOR)) return true;
    const resp = el.closest('[data-testid="agent-response"]');
    if (resp) {
      const block = el.closest(MARKDOWN_BLOCK);
      if (block && resp.contains(block)) return true;
    }
    return false;
  }

  // written: what we last put into a text node; orig: the English it replaced.
  // A node whose value differs from `written` was changed by the app since.
  const written = new WeakMap();
  const orig = new WeakMap();
  const originalOf = (n) => (written.has(n) && written.get(n) === n.nodeValue ? orig.get(n) : n.nodeValue);
  function setText(n, original, out) {
    orig.set(n, original);
    written.set(n, out);
    if (n.nodeValue !== out) n.nodeValue = out;
  }
  function restore(n) {
    if (written.has(n) && written.get(n) === n.nodeValue) n.nodeValue = orig.get(n);
    written.delete(n);
  }

  // JSX like `No {kind} yet` renders as several sibling text nodes. When an
  // element holds only text nodes, translate the joined sentence as a whole:
  // the first node gets the translation, the others are emptied.
  function tryGroup(el) {
    const kids = el.childNodes;
    if (kids.length < 2 || kids.length > 8) return false;
    for (const k of kids) if (k.nodeType !== 3) return false;
    const originals = Array.from(kids, originalOf);
    const joined = originals.join('');
    const out = joined.length <= 600 && /[A-Za-z]/.test(joined) ? translate(joined) : null;
    if (out === null) {
      if (el.__agyZhGroup) {
        // The sentence changed and no longer matches: put the English back, then
        // fall back to translating each piece on its own.
        el.__agyZhGroup = false;
        for (const k of kids) restore(k);
        for (const k of kids) singleText(k, true);
      }
      return false;
    }
    el.__agyZhGroup = true;
    Array.from(kids).forEach((k, i) => setText(k, originals[i], i === 0 ? out : ''));
    return true;
  }

  function singleText(node, inGroup) {
    const v = node.nodeValue;
    if (!v || v.length > 600 || !/[A-Za-z]/.test(v)) return;
    // A lone word inside a sentence built from pieces ("No " + kind + " yet")
    // would leave a half-translated sentence; keep those pieces in English.
    if ((inGroup || isGroupMember(node)) && !/Ss+S/.test(v.trim())) return;
    if (written.has(node) && written.get(node) === v) return;
    const out = translate(v);
    if (out !== null && out !== v) setText(node, v, out);
  }

  function isGroupMember(node) {
    const el = node.parentElement;
    if (!el || el.childNodes.length < 2) return false;
    for (const k of el.childNodes) if (k.nodeType !== 3) return false;
    return true;
  }

  function doText(node) {
    const parent = node.parentElement;
    if (!parent) return;
    const v = node.nodeValue;
    if (written.has(node) && written.get(node) === v) return;
    if (skipped(parent)) return;
    if (tryGroup(parent)) return;
    singleText(node);
  }

  const ATTRS = ['placeholder', 'title'];
  function doAttrs(el) {
    // An input's own placeholder is UI text even though its value is not.
    const host = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.parentElement : el;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !/[A-Za-z]/.test(v)) continue;
      const out = translate(v);
      if (out !== null && out !== v && !skipped(host)) el.setAttribute(a, out);
    }
  }

  function walk(root) {
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

  // Native context menus: labels come from the hub page; only the label shown
  // in the menu is translated, the returned item id is unchanged.
  globalThis.__agyZhMenu = function (items) {
    if (!Array.isArray(items)) return items;
    return items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const copy = Object.assign({}, it);
      if (typeof copy.label === 'string') {
        const t = translate(copy.label);
        if (t !== null) copy.label = t;
      }
      if (Array.isArray(copy.submenu)) copy.submenu = globalThis.__agyZhMenu(copy.submenu);
      return copy;
    });
  };

  // System notifications sent by the hub page (title/body only).
  globalThis.__agyZhNotif = function (options) {
    if (!options || typeof options !== 'object') return options;
    const copy = Object.assign({}, options);
    for (const k of ['title', 'body']) {
      if (typeof copy[k] === 'string') {
        const t = translate(copy[k]);
        if (t !== null) copy[k] = t;
      }
    }
    return copy;
  };

  try {
    if (document.documentElement) start();
    else document.addEventListener('readystatechange', start, { once: true });
  } catch (e) {
    console.warn('[antigravity-zh] hub translation disabled:', e);
  }
})();
