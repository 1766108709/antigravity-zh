/* antigravity-zh: hub UI translation layer.
 * Appended to dist/preload.js by scripts/apply.mjs. The hub page is served by
 * language_server.exe (https://127.0.0.1:<port>/), so its JS bundle cannot be
 * edited on disk; instead this code runs in the preload (isolated world) and
 * rewrites displayed text nodes and placeholder/title attributes in place.
 * Display only: it never changes aria-label, values sent over IPC, DOM child
 * element order/count, or any application state.
 */
(function agyZhHubI18n() {
  'use strict';
  if (globalThis.__agyZhInstalled) return;
  globalThis.__agyZhInstalled = true;

  const DICT = /*@AGY_ZH_DICT@*/ { entries: {} };
  const exact = new Map();
  const templates = [];
  const richByCount = new Map(); // elementSlotCount -> RichTemplate[]
  const PH = /\{(\d+)\}/g;
  const EL_SLOT = /<(\d+)>/g;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  // Chinese wording that only makes sense around a number: 第 {0} 轮, {0} 个, {0} 秒 ...
  const COUNTED = '个|条|项|轮|步|行|列|页|秒|分钟|小时|天|周|次|份|张|段';
  const isCounted = (zh, n) =>
    new RegExp('第\\s*\\{' + n + '\\}|\\{' + n + '\\}\\s*(?:' + COUNTED + ')').test(zh);
  const isBare = (en, start, end) => {
    const before = en.slice(0, start).replace(/\s+$/, '');
    const after = en.slice(end).replace(/^\s+/, '');
    const left = before ? before[before.length - 1] : '';
    const right = after ? after[0] : '';
    return !/[^A-Za-z0-9\s]/.test(left) && !/[^A-Za-z0-9\s]/.test(right);
  };
  const FUNCTION_WORDS = new Set(('a an the to into onto from with without of in on at for by about over under via ' +
    'after before while my your our their his her its it me you us them this that these those and or but nor ' +
    'is are was were be been am do does did can will should would could may might must not no all any some ' +
    'what when where which who how here there now then than so if as up down out off just only also').split(' '));
  const looksLikePhrase = (v) =>
    v.split(/\s+/).some((w) => FUNCTION_WORDS.has(w.toLowerCase().replace(/[^a-z']/g, '')));

  function buildSegmentMatcher(enSeg, zhFull) {
    const trimmed = norm(enSeg);
    if (!/\{\d+\}/.test(trimmed)) {
      return { exact: trimmed };
    }
    const order = [];
    const slots = [];
    let src = '';
    let last = 0;
    trimmed.replace(PH, (m, n, off) => {
      src += escapeRe(trimmed.slice(last, off)) + '([\\s\\S]+?)';
      order.push(Number(n));
      slots.push({ counted: isCounted(zhFull, n), bare: isBare(trimmed, off, off + m.length) });
      last = off + m.length;
      return m;
    });
    src += escapeRe(trimmed.slice(last));
    src = src.replace(/([A-Za-z])\(\[\\s\\S\]\+\?\)/g, '$1([\\s\\S]*?)');
    return { re: new RegExp('^' + src + '$'), order, slots };
  }

  function splitByElementSlots(str) {
    const parts = [];
    let expected = 0;
    let last = 0;
    let valid = true;
    str.replace(EL_SLOT, (m, n, off) => {
      if (Number(n) !== expected) valid = false;
      parts.push(str.slice(last, off));
      expected++;
      last = off + m.length;
      return m;
    });
    parts.push(str.slice(last));
    return valid && expected >= 1 && expected <= 6 ? { count: expected, parts } : null;
  }

  for (const [en, zh] of Object.entries(DICT.entries)) {
    if (typeof zh !== 'string' || !zh) continue;
    if (/<(\d+)>/.test(en)) {
      const enSplit = splitByElementSlots(en);
      const zhSplit = splitByElementSlots(zh);
      if (!enSplit || !zhSplit || enSplit.count !== zhSplit.count) continue;
      const matchers = enSplit.parts.map((p) => buildSegmentMatcher(p, zh));
      let list = richByCount.get(enSplit.count);
      if (!list) richByCount.set(enSplit.count, (list = []));
      list.push({ slotCount: enSplit.count, matchers, zhParts: zhSplit.parts, literal: en.replace(EL_SLOT, '').replace(PH, '').length });
    } else if (/\{\d+\}/.test(en)) {
      const m = buildSegmentMatcher(en, zh);
      const literalText = en.replace(PH, '');
      if ((literalText.match(/[A-Za-z]/g) || []).length < 3) continue;
      const chunks = en.split(PH).filter((_, i) => i % 2 === 0);
      const needle = chunks.reduce((a, b) => (b.length > a.length ? b : a), '').trim();
      templates.push({ re: m.re, order: m.order, slots: m.slots, zh, literal: literalText.length, needle });
    } else {
      exact.set(norm(en), zh);
    }
  }
  templates.sort((a, b) => b.literal - a.literal);
  for (const list of richByCount.values()) list.sort((a, b) => b.literal - a.literal);

  // Scoped inner-slot vocabulary: translates lowercase verbs/nouns inside {0}
  // templates without polluting standalone text nodes elsewhere in the UI.
  const VALUE_MAP = new Map([
    ['archive', '归档'],
    ['unarchive', '取消归档'],
    ['pin', '置顶'],
    ['unpin', '取消置顶'],
    ['delete', '删除'],
    ['rename', '重命名'],
    ['restore', '恢复'],
    ['project', '项目'],
    ['projects', '项目'],
    ['workspace', '工作区'],
    ['workspaces', '工作区'],
    ['automation', '自动化'],
    ['automations', '自动化'],
    ['plugin', '插件'],
    ['plugins', '插件'],
    ['bundle', '插件包'],
    ['bundles', '插件包'],
    ['extension', '扩展'],
    ['extensions', '扩展'],
    ['skill', '技能'],
    ['skills', '技能'],
    ['rule', '规则'],
    ['rules', '规则'],
    ['agent', '智能体'],
    ['agents', '智能体'],
    ['custom agents', '自定义智能体'],
    ['group', '分组'],
    ['hook', '钩子'],
    ['hooks', '钩子'],
    ['folder', '文件夹'],
    ['combination of folders', '文件夹组合'],
    ['weekly', '本周'],
    ['daily', '今日'],
    ['hourly', '本小时'],
    ['monthly', '本月'],
    ['5-hour', ' 5 小时'],
    ['five-hour', ' 5 小时'],
    ['read access to this path', '读取此路径'],
    ['write access to this path', '写入此路径'],
    ['reading this URL', '读取此 URL'],
    ['executing actions on this URL', '操控此 URL'],
    ['browser downloads from this site', '通过浏览器从此网站下载'],
    ['running this command', '运行此命令'],
    ['running this command outside the sandbox', '在沙盒外运行此命令'],
    ['using this MCP tool', '使用此 MCP 工具'],
    ['a one-time administrator (UAC) elevation', '一次性管理员（UAC）提权'],
    ['access to this resource', '访问此资源'],
  ]);

  const UNITS = { year: '年', month: '个月', week: '周', day: '天', hour: '小时', minute: '分钟', min: '分钟', second: '秒', sec: '秒' };
  const SHORT_UNITS = { d: '天', h: '小时', m: '分钟', s: '秒' };
  function localizeValue(v) {
    const k = norm(v);
    const sub = exact.get(k) ?? VALUE_MAP.get(k);
    if (sub !== undefined) return sub;
    if (/^\d+(?:st|nd|rd|th)$/i.test(k)) return parseInt(k, 10) + ' 日';
    if (/^\d+[dhms](?:\s+\d+[dhms])*$/i.test(k)) {
      return k.replace(/(\d+)([dhms])/gi, (_, n, u) => `${n} ${SHORT_UNITS[u.toLowerCase()]}`);
    }
    const d = v.replace(/\b(\d+)\s*(year|month|week|day|hour|minute|min|second|sec)s?\b/gi, (_, n, u) => `${n} ${UNITS[u.toLowerCase()]}`)
      .replace(/\s*(,|\band\b)\s*/g, ' ').trim();
    return /[A-Za-z]/.test(d) ? v : d;
  }

  function matchSegment(matcher, rawSeg, vals) {
    const key = norm(rawSeg);
    if (matcher.exact !== undefined) return key === matcher.exact;
    const m = matcher.re.exec(key);
    if (!m) return false;
    for (let i = 0; i < matcher.order.length; i++) {
      const n = matcher.order[i];
      const raw = m[i + 1];
      const v = localizeValue(raw);
      const slot = matcher.slots[i];
      if (slot.counted && !/\d/.test(raw)) return false;
      if (slot.bare && v === raw && looksLikePhrase(raw)) return false;
      vals[n] = v;
    }
    return true;
  }

  function translateCore(text) {
    const key = norm(text);
    if (!key || !/[A-Za-z]/.test(key)) return null;
    const hit = exact.get(key);
    if (hit !== undefined) return hit;
    if (templates.length === 0 || key.length > 400) return null;
    for (const t of templates) {
      if (t.needle && !key.includes(t.needle)) continue;
      const vals = [];
      if (!matchSegment(t, key, vals)) continue;
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

  // User-owned names (project folders, custom groups, conversation titles,
  // automations, branches, hosts, plugins, code, editors, messages) are never
  // translated, even when a folder or chat happens to be named "Workspace" or "Models".
  const SKIP_SELECTOR = [
    'script', 'style', 'noscript', 'textarea', 'input', 'code', 'pre', 'kbd', 'samp', 'svg',
    '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
    '.xterm', '.monaco-editor', '.cm-editor', '[role="treeitem"]', '[data-agy-zh-skip]',
    '[data-lexical-editor]', '[data-lexical-beautiful-mention]',
    '[data-testid="user-message-content"]', '[data-testid="user-message-bubble"]',
    '[data-testid="transcript-line-text"]', '[data-testid="live-transcript"]',
    '[data-testid="automation-instructions-markdown"]', '[data-testid="commentable-content"]',
    '[data-testid="sidecar-logs-content"]', '[data-testid="markdown-code-block-preview"]',
    '[data-testid="file-title-name"]', '[data-testid="breadcrumb-segment"]',
    '[data-testid="webview-download-filename"]', '[data-testid="ssh-config-file-name"]',
    '[data-testid="csv-file-viewer"]', '[data-testid="terminal-surface"]',
    '[data-testid="permission-target-editor"]', '[data-testid="declared-permissions-arg-folder"]',
    // User project / folder names (sidebar headers with folder/cloud/google3 icons, selector items & active project trigger)
    '[data-testid="project-header"][data-project-icon="folder"]',
    '[data-testid="project-header"][data-project-icon="cloud"]',
    '[data-testid="project-header"][data-project-icon="google3"]',
    '[data-testid="project-selector-item"]',
    '[data-testid="project-selector-trigger"]:has([data-project-icon])',
    '[data-testid="sidecar-project-link"]',
    '[data-testid="ssh-host-project-item"]',
    // User-created group names, automation names, custom agent/model/plugin names, host/VCS identifiers
    '[data-testid="conversation-group-header"] h2',
    '[data-testid="automation-name"]',
    '[data-testid="coordinator-settings-name"]',
    '[data-testid="new-sidecar-name"]',
    '[data-testid="model-selector-custom-item"]',
    '[data-testid="plugin-sidebar-sortable-item"]',
    '[data-testid="plugin-view-title-bar-title"]',
    '[data-testid="mobile-plugin-view-title"]',
    '[data-testid="browser-site-data-site"] > div > span:first-child',
    '[data-member-name]', '[data-ssh-host]', '[data-wsl-distro]',
    '[data-repo-slug]', '[data-symbol-name]', '[data-variable-name]',
  ].join(',');
  const MARKDOWN_BLOCK = 'p,li,td,th,blockquote,h1,h2,h3,h4,h5,h6,dd,dt';
  const PLACEHOLDER_CONV_TITLES = new Set(['Untitled', 'Untitled Conversation', 'New Conversation', 'No message text']);
  const BUILTIN_SETTINGS_NAV = new Set([
    'General', 'App', 'Application', 'Appearance', 'Shortcuts', 'Notifications', 'Models',
    'Browser', 'Account', 'Customizations', 'Permissions', 'GitHub', 'Developer', 'Labs',
    'Running', 'Jetski Chat', 'Conversations', 'Provide Feedback',
  ]);

  function skipped(el, rawText) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest(SKIP_SELECTOR)) return true;
    // Settings sidebar: items under "Projects" / "Workspaces" (or any non-built-in nav item) are user project/folder names.
    const navBtn = el.closest('button[data-testid^="settings-nav-item-"]');
    if (navBtn) {
      const navId = navBtn.getAttribute('data-testid').slice('settings-nav-item-'.length);
      if (!BUILTIN_SETTINGS_NAV.has(navId)) return true;
      if (navId !== 'Conversations') {
        const listDiv = navBtn.parentElement && navBtn.parentElement.parentElement;
        const prev = listDiv && listDiv.previousElementSibling;
        if (prev && prev.querySelector && prev.querySelector('h2')) return true;
      }
    }
    // Settings detail pane header / breadcrumb when viewing a user project's settings
    if (rawText && el.closest('h1, h2, .select-none') && typeof document !== 'undefined' && document.querySelector) {
      const activeNav = document.querySelector('[data-testid="settings-sidebar"] button[data-testid^="settings-nav-item-"].bg-sidebar-secondary');
      if (activeNav) {
        const activeId = activeNav.getAttribute('data-testid').slice('settings-nav-item-'.length);
        if (!BUILTIN_SETTINGS_NAV.has(activeId) && norm(rawText) === norm(activeId)) return true;
      }
    }
    // Sidebar / history conversation row titles: keep user-authored titles intact,
    // only translate built-in empty placeholders like "Untitled".
    if (el.closest('[data-testid^="conversation-row-"] .pointer-events-none')) {
      const k = rawText ? norm(rawText) : '';
      if (!PLACEHOLDER_CONV_TITLES.has(k)) return true;
    }
    // Subagent / coordinator worker header & card titles: keep custom role names, only translate generic defaults.
    if (el.closest('[data-testid="subagent-tab-header-title"], [data-testid="coordinator-card-title"], [data-testid="subagent-node"] > div:first-child > div:first-child > span:first-child')) {
      const k = rawText ? norm(rawText) : '';
      if (k !== 'Subagent' && k !== 'Coordinator') return true;
    }
    const resp = el.closest('[data-testid="agent-response"]');
    if (resp) {
      const block = el.closest(MARKDOWN_BLOCK);
      if (block && resp.contains(block)) return true;
    }
    return false;
  }

  const written = new WeakMap();
  const orig = new WeakMap();
  const richLocks = new WeakSet();
  const originalOf = (n) => (written.has(n) && written.get(n) === n.nodeValue ? orig.get(n) : n.nodeValue);
  function setText(n, original, out) {
    orig.set(n, original);
    written.set(n, out);
    if (n.nodeValue !== out) n.nodeValue = out;
  }
  function restore(n) {
    if (written.has(n) && written.get(n) === n.nodeValue) n.nodeValue = orig.get(n);
    written.delete(n);
    richLocks.delete(n);
  }

  // Pure text-node siblings ("No " + kind + " yet")
  function tryGroup(el) {
    const kids = el.childNodes;
    if (kids.length < 2 || kids.length > 10) return false;
    for (const k of kids) if (k.nodeType !== 3) return false;
    const originals = Array.from(kids, originalOf);
    const joined = originals.join('');
    const out = joined.length <= 600 && /[A-Za-z]/.test(joined) ? translate(joined) : null;
    if (out === null) {
      if (el.__agyZhGroup) {
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

  // Inline rich sentences mixing text nodes with inline child elements
  // (e.g. `Go to <b>Workspace</b> in the top menu.` -> `"Go to <0> in the top menu."`).
  // Never inserts, deletes, or reorders Element nodes so React Fiber reconciliation stays 100% safe.
  const INLINE_TAGS = new Set(['SPAN', 'A', 'CODE', 'STRONG', 'B', 'EM', 'I', 'KBD', 'BUTTON', 'ABBR', 'SMALL', 'SVG']);
  function tryRichGroup(el) {
    if (richByCount.size === 0) return false;
    const kids = el.childNodes;
    if (kids.length < 2 || kids.length > 16) return false;
    const segNodes = [[]];
    let elCount = 0;
    let textCount = 0;
    for (const k of kids) {
      if (k.nodeType === 3) {
        segNodes[elCount].push(k);
        textCount++;
      } else if (k.nodeType === 1 && INLINE_TAGS.has(k.tagName)) {
        elCount++;
        if (elCount > 6) return false;
        segNodes.push([]);
      } else {
        return false;
      }
    }
    if (elCount === 0 || textCount === 0) return false;
    const candidates = richByCount.get(elCount);
    if (!candidates) return false;

    const segOriginals = segNodes.map((nodes) => nodes.map(originalOf));
    const segTexts = segOriginals.map((arr) => arr.join(''));
    if (!segTexts.some((s) => /[A-Za-z]/.test(s))) return false;

    for (const rt of candidates) {
      // Every non-empty translated segment must have at least one existing text node to hold it.
      let canWrite = true;
      for (let i = 0; i <= elCount; i++) {
        if (rt.zhParts[i] && segNodes[i].length === 0) {
          canWrite = false;
          break;
        }
      }
      if (!canWrite) continue;

      const vals = [];
      let matched = true;
      for (let i = 0; i <= elCount; i++) {
        if (!matchSegment(rt.matchers[i], segTexts[i], vals)) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;

      el.__agyZhRich = true;
      for (let i = 0; i <= elCount; i++) {
        const rendered = rt.zhParts[i].replace(PH, (_, n) => (vals[Number(n)] !== undefined ? vals[Number(n)] : ''));
        segNodes[i].forEach((node, idx) => {
          richLocks.add(node);
          setText(node, segOriginals[i][idx], idx === 0 ? rendered : '');
        });
      }
      return true;
    }

    if (el.__agyZhRich) {
      el.__agyZhRich = false;
      for (const nodes of segNodes) for (const n of nodes) restore(n);
    }
    return false;
  }

  function singleText(node, inGroup) {
    if (richLocks.has(node)) return;
    const v = node.nodeValue;
    if (!v || v.length > 600 || !/[A-Za-z]/.test(v)) return;
    if (inGroup || isGroupMember(node)) return;
    if (written.has(node) && written.get(node) === v) return;
    let out = translate(v);
    if (out === null && norm(v) === 'New' && node.parentElement && node.parentElement.closest('[data-testid="sidecar-new-button"]')) {
      const lead = /^\s*/.exec(v)[0];
      const trail = /\s*$/.exec(v)[0];
      out = lead + '新建' + trail;
    }
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
    const raw = originalOf(node);
    if (skipped(parent, raw)) return;
    if (tryGroup(parent)) return;
    if (tryRichGroup(parent)) return;
    singleText(node);
  }

  const ATTRS = ['placeholder', 'title'];
  function doAttrs(el) {
    const host = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? el.parentElement : el;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !/[A-Za-z]/.test(v)) continue;
      if (skipped(host, v)) continue;
      const out = translate(v);
      if (out !== null && out !== v) el.setAttribute(a, out);
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
