// Minimal CDP helper for verification (Node 24, global WebSocket).
// Usage:
//   node cdp.mjs list [port]
//   node cdp.mjs shot <port> <targetId|urlSubstr> <out.png>
//   node cdp.mjs eval <port> <targetId|urlSubstr> <expression>
//   node cdp.mjs scripts <port> <targetId|urlSubstr> <outDir>
import fs from 'node:fs';
import path from 'node:path';

const [, , cmd, portArg = '9333', sel, arg] = process.argv;
const port = Number(portArg);

async function targets() {
  const r = await fetch(`http://127.0.0.1:${port}/json/list`);
  return r.json();
}

async function pick(sel) {
  const ts = await targets();
  const t = ts.find((x) => x.id === sel) || ts.find((x) => x.type === 'page' && x.url.includes(sel));
  if (!t) throw new Error(`target not found: ${sel}\n` + ts.map((x) => `${x.id} ${x.type} ${x.url.slice(0, 80)}`).join('\n'));
  return t;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  return new Promise((resolve, reject) => {
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const mid = ++id;
            pending.set(mid, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id: mid, method, params }));
          }),
        on: (fn) => listeners.push(fn),
        close: () => ws.close(),
      });
  });
}

if (cmd === 'list') {
  for (const t of await targets()) console.log(t.id, t.type, t.url.slice(0, 120));
  process.exit(0);
}

const t = await pick(sel);
const c = await connect(t.webSocketDebuggerUrl);
if (cmd === 'shot') {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(arg, Buffer.from(r.data, 'base64'));
  console.log('saved', arg);
} else if (cmd === 'eval') {
  const r = await c.send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
  const v = r.result.value;
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
} else if (cmd === 'scripts') {
  const scripts = [];
  c.on((m) => {
    if (m.method === 'Debugger.scriptParsed') scripts.push(m.params);
  });
  await c.send('Debugger.enable');
  await new Promise((r) => setTimeout(r, 1500));
  fs.mkdirSync(arg, { recursive: true });
  let n = 0;
  for (const s of scripts) {
    if (!s.url) continue;
    const src = await c.send('Debugger.getScriptSource', { scriptId: s.scriptId });
    const name = (n++).toString().padStart(3, '0') + '_' + s.url.replace(/^[a-z]+:\/\/[^/]+\//, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
    fs.writeFileSync(path.join(arg, name), src.scriptSource);
    console.log(name, s.url, src.scriptSource.length);
  }
  await c.send('Debugger.disable');
}
c.close();
process.exit(0);
