// node ui.mjs <port> <targetId> <action> [arg]
//   harvest <outfile-append>      collect visible untranslated text into file
//   click <css>                   click first match
//   clicktext <text>              click the innermost visible element whose trimmed text equals text
//   key <Key>                     dispatch key (Escape etc.) to document
//   shot <file>
import fs from 'node:fs';
const [, , port, id, action, arg] = process.argv;
const ts = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const t = ts.find((x) => x.id === id) || ts.find((x) => x.type === 'page' && x.url.startsWith('https://127.0.0.1'));
const ws = new WebSocket(t.webSocketDebuggerUrl);
let mid = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++mid; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
if (action === 'harvest') {
  const v = await ev(fs.readFileSync(new URL('./harvest.js', import.meta.url), 'utf8'));
  fs.appendFileSync(arg, v + '\n');
  console.log(v);
} else if (action === 'click') {
  console.log(await ev(`(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return 'not found'; el.click(); return 'ok'; })()`));
} else if (action === 'clicktext') {
  console.log(await ev(`(() => { const want = ${JSON.stringify(arg)}; const els = [...document.querySelectorAll('button,a,[role=menuitem],[role=tab],[role=option],span,div,li')].filter(e => e.textContent.trim() === want && e.getBoundingClientRect().width > 0); const el = els[els.length - 1]; if (!el) return 'not found'; (el.closest('button,a,[role=menuitem],[role=tab],[role=option]') || el).click(); return 'ok ' + els.length; })()`));
} else if (action === 'key') {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: arg, code: arg, windowsVirtualKeyCode: arg === 'Escape' ? 27 : 0 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: arg, code: arg, windowsVirtualKeyCode: arg === 'Escape' ? 27 : 0 });
  console.log('key', arg);
} else if (action === 'shot') {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(arg, Buffer.from(r.result.data, 'base64'));
  console.log('saved', arg);
}
ws.close(); process.exit(0);
