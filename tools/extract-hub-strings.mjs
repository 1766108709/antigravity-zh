// Extract candidate UI strings from the hub bundle (served by language_server.exe).
// usage: node tools/extract-hub-strings.mjs <main.js from the hub> <out.json>   (needs: npm install)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const walk = require('acorn-walk');

const [, , input, output] = process.argv;
const src = fs.readFileSync(input, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });

const UI_KEYS = new Set([
  'label', 'title', 'description', 'placeholder', 'tooltip', 'aria-label', 'ariaLabel', 'text', 'message',
  'header', 'heading', 'subtitle', 'subTitle', 'emptyText', 'emptyMessage', 'emptyState', 'buttonText', 'buttonLabel',
  'confirmText', 'confirmLabel', 'cancelText', 'cancelLabel', 'actionLabel', 'primaryActionLabel', 'secondaryActionLabel',
  'hint', 'helperText', 'helpText', 'caption', 'name', 'displayName', 'content', 'body', 'detail', 'details', 'summary',
  'tooltipContent', 'errorMessage', 'successMessage', 'loadingText', 'inputPlaceholder', 'prompt', 'shortLabel', 'longLabel',
  'unnamed', 'subtext', 'sublabel', 'subLabel', 'badge', 'confirmButtonText', 'cancelButtonText', 'okText', 'okLabel',
  'submitLabel', 'submitText', 'children', 'value', 'notice', 'warning', 'info', 'error', 'reason', 'explanation',
]);

const out = new Map();
function add(str, ctx, pos) {
  if (typeof str !== 'string') return;
  const s = str;
  if (!/[A-Za-z]/.test(s)) return;
  let e = out.get(s);
  if (!e) out.set(s, (e = { s, ctx: {}, n: 0, pos }));
  e.n++;
  e.ctx[ctx] = (e.ctx[ctx] || 0) + 1;
}

function isCreateElement(node) {
  return node && node.type === 'CallExpression' && node.callee &&
    ((node.callee.type === 'MemberExpression' && node.callee.property && node.callee.property.name === 'createElement') ||
     (node.callee.type === 'Identifier' && /^(jsxs?|h)$/.test(node.callee.name)));
}

function keyName(p) {
  if (!p || p.type !== 'Property') return null;
  if (p.key.type === 'Identifier') return p.key.name;
  if (p.key.type === 'Literal') return String(p.key.value);
  return null;
}

// Walk up through value-forwarding nodes to find the semantic context.
function context(node, ancestors) {
  let child = node;
  for (let i = ancestors.length - 2; i >= 0; i--) {
    const a = ancestors[i];
    if (a.type === 'ConditionalExpression' && child !== a.test) { child = a; continue; }
    if (a.type === 'LogicalExpression') { child = a; continue; }
    if (a.type === 'ArrayExpression') { child = a; continue; }
    if (a.type === 'SequenceExpression') { child = a; continue; }
    if (a.type === 'TemplateLiteral') { child = a; continue; }
    if (a.type === 'BinaryExpression' && a.operator === '+') { child = a; continue; }
    if (a.type === 'ParenthesizedExpression') { child = a; continue; }
    if (isCreateElement(a)) {
      const idx = a.arguments.indexOf(child);
      if (idx >= 2) return 'child';
      if (idx === 0) return null; // tag name
      return null;
    }
    if (a.type === 'Property' && a.value === child) {
      const k = keyName(a);
      if (k && UI_KEYS.has(k)) return 'prop:' + k;
      return null;
    }
    if (a.type === 'ReturnStatement') return 'return';
    if (a.type === 'ArrowFunctionExpression' && a.body === child) return 'return';
    if (a.type === 'CallExpression') {
      const callee = a.callee;
      const nm = callee.type === 'Identifier' ? callee.name : callee.type === 'MemberExpression' && callee.property ? callee.property.name : '';
      if (/^(toast|showToast|notify|showNotification|alert|confirm|error|success|warning|info|addToast|setError|setMessage|setStatus)$/i.test(nm)) return 'call:' + nm;
      return null;
    }
    if (a.type === 'NewExpression' && a.callee && a.callee.name === 'Error') return null;
    return null;
  }
  return null;
}

walk.fullAncestor(ast, (node, _state, ancestors) => {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    const parent = ancestors[ancestors.length - 2];
    if (parent && parent.type === 'Property' && parent.key === node) return; // object key
    const ctx = context(node, ancestors);
    if (ctx) add(node.value, ctx, node.start);
  } else if (node.type === 'TemplateLiteral') {
    const ctx = context(node, ancestors);
    if (!ctx) return;
    const parts = node.quasis.map((q) => q.value.cooked ?? q.value.raw);
    const tpl = parts.reduce((acc, p, i) => acc + (i ? '{' + (i - 1) + '}' : '') + p, '');
    add(tpl, (node.expressions.length ? 'tpl:' : '') + ctx, node.start);
  }
});

function looksLikeUi(s) {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/[A-Za-z]{2}/.test(t)) return false;
  if (/^[a-z0-9_.:/-]+$/.test(t) && !/ /.test(t)) return false; // identifiers, paths, classnames-ish
  if (/^(https?:|mailto:|data:|file:|#|\.|\/)/.test(t)) return false;
  if (/^[\w-]+(\s+[\w:/\[\]().%-]+)+$/.test(t) && /(^|\s)(flex|grid|text-|bg-|p[xytrbl]?-\d|m[xytrbl]?-\d|w-|h-|rounded|border|items-|justify-|gap-|hover:|opacity-|font-|truncate|min-|max-|overflow|absolute|relative|inset|z-|shrink|grow)/.test(t)) return false; // tailwind
  if (/[{}<>;=]/.test(t) && !/\{\d\}/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t)) return false; // CONSTANTS
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false; // camelCase identifiers
  return true;
}

const list = [...out.values()].filter((e) => looksLikeUi(e.s)).sort((a, b) => a.pos - b.pos);
fs.writeFileSync(output, JSON.stringify(list, null, 1));
console.log('total literal entries:', out.size, 'ui candidates:', list.length);
const byCtx = {};
for (const e of list) for (const c of Object.keys(e.ctx)) byCtx[c] = (byCtx[c] || 0) + 1;
console.log(Object.entries(byCtx).sort((a, b) => b[1] - a[1]).slice(0, 40));
