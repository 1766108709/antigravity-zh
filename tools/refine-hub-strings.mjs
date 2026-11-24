// Refine extract-hub-strings output into a translation worklist.
// usage: node tools/refine-hub-strings.mjs <candidates.json> <out.json> [--missing]
//   --missing  keep only strings that dict/hub.json does not have yet (after an update)
import fs from 'node:fs';
const [, , input, output, flag] = process.argv;
const norm = (x) => x.replace(/\s+/g, ' ').trim();
const known = flag === '--missing'
  ? new Set(Object.keys(JSON.parse(fs.readFileSync(new URL('../dict/hub.json', import.meta.url), 'utf8')).entries).map(norm))
  : new Set();
const list = JSON.parse(fs.readFileSync(input, 'utf8'));

const STRONG = /^(tpl:)?(child|prop:(label|title|description|tooltip|placeholder|content|message|text|subtitle|subTitle|body|summary|submitLabel|buttonText|buttonLabel|confirmText|confirmLabel|cancelText|cancelLabel|actionLabel|primaryActionLabel|secondaryActionLabel|hint|helperText|helpText|caption|displayName|emptyText|emptyMessage|errorMessage|successMessage|loadingText|inputPlaceholder|heading|header|unnamed|subtext|sublabel|subLabel|badge|confirmButtonText|cancelButtonText|okText|okLabel|submitText|notice|warning|reason|explanation|detail|details|tooltipContent|shortLabel|longLabel)|call:(toast|showToast|notify|showNotification|addToast|setError|setMessage|setStatus))$/;

function ok(e) {
  const s = e.s;
  const t = s.trim();
  const ctxs = Object.keys(e.ctx);
  const strong = ctxs.some((c) => STRONG.test(c));
  const weak = ctxs.some((c) => /^(tpl:)?(return|prop:(name|value|error|info))$/.test(c));
  if (!strong && !weak) return false;
  // obvious internals
  if (/__|\\\\\?\\|^\{0\}[/:]|[/:]\{0\}$|^[\w-]+-\{0\}|^\{0\}-|\{0\}:\w+$|^_/.test(t)) return false;
  if (/^[a-z][\w-]*(\.[\w-]+)+$/.test(t)) return false; // dotted ids
  if (/^[A-Z][a-zA-Z0-9]+(Proto|Options|Set|Range|Info|Error|Type|Mode|Level|Defaults|Default|Part)$/.test(t) && !/ /.test(t)) {
    if (!strong) return false;
  }
  if (/^[A-Za-z]+[A-Z][a-z]+[A-Za-z]*$/.test(t) && !strong) return false; // PascalCase single token
  if (/^(application|text|image|video|audio|font)\//.test(t)) return false;
  if (/^[\w.-]+\.(js|ts|tsx|json|md|png|svg|html|css|py|go|rs)$/.test(t)) return false;
  if (!strong) {
    // weak contexts need a sentence or Title Case multiword
    const words = t.split(/\s+/);
    const titleCase = words.length >= 2 && words.filter((w) => /^[A-Z]/.test(w)).length >= Math.ceil(words.length / 2);
    const sentence = /^[A-Z][a-z]/.test(t) && words.length >= 3;
    if (!titleCase && !sentence) return false;
    if (/[`'"].*(expects|draftable|immer|proxy|undefined|null|instanceof)/i.test(t)) return false;
  }
  if (/\b(Immer|draftable|revoked|instanceof|typeof|undefined is not|JSON\.parse|protobuf|Proto\b)/.test(t)) return false;
  return true;
}

const res = list.filter(ok).filter((e) => !known.has(norm(e.s))).map((e) => ({ s: e.s, ctx: Object.keys(e.ctx).join(','), pos: e.pos }));
fs.writeFileSync(output, JSON.stringify(res, null, 1));
console.log('kept', res.length, 'chars', res.reduce((a, e) => a + e.s.length, 0));
