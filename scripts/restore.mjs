// Remove the Chinese layer: delete resources\app and, in rename mode, rename app.asar.bak back.
//   node scripts/restore.mjs [--install <dir>] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { MARKER, parseArgs, installPaths, runningAppProcesses } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const p = installPaths(args);

const running = await runningAppProcesses(p.exe);
if (running.length) {
  console.warn(`警告：Antigravity 正在运行（PID ${running.map((r) => r.pid).join(', ')}）。还原后需要重启它才生效。`);
}

let changed = false;
for (const dir of [p.staging, p.old]) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`已删除残留的 ${dir}`);
    changed = true;
  }
}
if (fs.existsSync(p.app)) {
  if (!fs.existsSync(path.join(p.app, MARKER)) && !args.force) {
    console.error(`失败：${p.app} 不是本脚本生成的（没有 ${MARKER}）。确认要删除就加 --force。`);
    process.exit(1);
  }
  fs.rmSync(p.app, { recursive: true, force: true });
  console.log(`已删除 ${p.app}`);
  changed = true;
}
if (!fs.existsSync(p.asar) && fs.existsSync(p.asarBak)) {
  fs.renameSync(p.asarBak, p.asar);
  console.log('已把 app.asar.bak 改回 app.asar');
  changed = true;
} else if (fs.existsSync(p.asar) && fs.existsSync(p.asarBak)) {
  console.log('提示：app.asar 和 app.asar.bak 同时存在（多半是更新装了新的 app.asar），保留 app.asar，未动 app.asar.bak。');
}
console.log(changed ? '已还原为英文原版。' : '没有需要还原的内容，当前就是英文原版。');
