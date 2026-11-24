// Apply the Simplified Chinese layer (UI + global Chinese rules plugin) to Antigravity (Windows & macOS).
//   node scripts/apply.mjs              build from the original app.asar into resources/app,
//                                       install zh-cn-language plugin, then rename app.asar -> app.asar.bak
//   node scripts/apply.mjs --check      only report versions / state
//   node scripts/apply.mjs --dry-run    build into tmp/build, do not touch the install or ~/.gemini
//   node scripts/apply.mjs --no-rename  write resources/app but leave app.asar in place
//   node scripts/apply.mjs --no-plugin  skip deploying the zh-cn-language global rules plugin
//   --install <dir>                     Antigravity install dir (default: Windows %LOCALAPPDATA%\Programs\antigravity, macOS /Applications/Antigravity.app)
//   --gemini-dir <dir>                  .gemini config root (default: ~/.gemini)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PROJECT_ROOT, MARKER, parseArgs, installPaths, pluginPaths, pluginStatus, installPlugin,
  extractAsar, readAsarFile, sha256File, readJson, originalAsar, status, runningAppProcesses,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const p = installPaths(args);
const pp = pluginPaths(args);
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('警告：', ...a);
const fail = (msg) => {
  console.error('失败：' + msg);
  process.exit(1);
};

// Electron in this app loads resources\app.asar before resources\app (tested on
// Electron 44.9.1), so the layer only takes effect while app.asar is renamed to
// app.asar.bak. The auto-updater writes a new app.asar, which then wins again:
// the updated English version runs instead of stale translated code.
function printStatus() {
  const s = status(p);
  const ps = pluginStatus(pp);
  const v = (x) => (x ? `版本 ${x}` : '版本未知');
  log(`安装目录：${p.base}`);
  log(`app.asar：${s.asarExists ? v(s.asarVersion) : '不存在'}；app.asar.bak：${s.bakExists ? v(s.bakVersion) : '不存在'}`);
  log(`${p.resourcesAppLabel}：${s.app ? `${v(s.appVersion)}${s.marker ? `，汉化于 ${s.marker.appliedAt}` : '，不是本脚本生成的'}` : '不存在'}`);
  log(`全局中文规则插件（${pp.name}）：${ps.installed ? `已安装${ps.version ? `（${v(ps.version)}）` : ''}${ps.managed ? '' : '（手动安装）'}，位于 ${ps.dir}` : `未安装（目标路径 ${ps.dir}）`}`);
  if (!s.asarExists && !s.bakExists) {
    warn('app.asar 和 app.asar.bak 都不存在，安装可能已损坏，请重新安装 Antigravity。');
    return 3;
  }
  if (!s.asarExists && !s.app) {
    warn(`app.asar 已改名但 ${p.resourcesAppLabel} 不存在，Antigravity 会打不开。请运行 ${p.restoreScript} 还原。`);
    return 3;
  }
  if (s.asarExists && s.app) {
    warn(`app.asar 又出现了（${v(s.asarVersion)}），它会优先于 ${p.resourcesAppLabel}（${v(s.appVersion)}）加载，` +
      `所以现在运行的是英文版。多半是应用自动更新过，请重新运行 ${p.applyScript}。`);
    return 2;
  }
  if (s.app && s.bakVersion && s.appVersion !== s.bakVersion) {
    warn(`${p.resourcesAppLabel} 的版本（${s.appVersion}）和 app.asar.bak 的版本（${s.bakVersion}）不一致，请重新运行 ${p.applyScript}。`);
    return 2;
  }
  log(s.app ? '状态：汉化已生效。' : '状态：英文原版。');
  return 0;
}

if (args.check) process.exit(printStatus());

// ---------------------------------------------------------------------------
// The newest original package: app.asar if present (fresh install or just
// updated), otherwise the app.asar.bak we renamed earlier.
const src = originalAsar(p);
if (!src) fail(`在 ${p.resources} 里找不到 app.asar（也没有 app.asar.bak）。请确认安装目录，或用 --install 指定。`);
const asarPkg = JSON.parse(readAsarFile(src, 'package.json').toString('utf8'));
log(`原始包：${src}（${asarPkg.name} ${asarPkg.version}）`);

const running = args['dry-run'] ? [] : await runningAppProcesses(p.exe);
if (running.length) {
  warn(`Antigravity 正在运行（PID ${running.map((r) => r.pid).join(', ')}）。文件照常写入，重启 Antigravity 后生效。`);
}

const buildRoot = args['dry-run'] ? path.join(PROJECT_ROOT, 'tmp', 'build') : null;
const staging = buildRoot ? path.join(buildRoot, 'app.zh-staging') : p.staging;
const target = buildRoot ? path.join(buildRoot, 'app') : p.app;
fs.rmSync(staging, { recursive: true, force: true });

const fileCount = extractAsar(src, staging, src.replace(/\.bak$/, '') + '.unpacked');
log(`已解包 ${fileCount} 个文件到 ${staging}`);

// --- main-process string literals ------------------------------------------
const mainDict = readJson(path.join(PROJECT_ROOT, 'dict', 'main.json'));
const touched = new Set();
let applied = 0;
const missing = [];
for (const [rel, rules] of Object.entries(mainDict.files)) {
  const file = path.join(staging, ...rel.split('/'));
  if (!fs.existsSync(file)) {
    missing.push(`${rel}（文件不存在，${rules.length} 条）`);
    continue;
  }
  let text = fs.readFileSync(file, 'utf8');
  for (const r of rules) {
    const n = text.split(r.from).length - 1;
    if (n === 0 || (r.count !== undefined && n !== r.count)) {
      missing.push(`${rel}: ${r.from.slice(0, 70)}（找到 ${n} 处${r.count !== undefined ? `，应为 ${r.count}` : ''}）`);
      continue;
    }
    text = text.split(r.from).join(r.to);
    applied++;
  }
  fs.writeFileSync(file, text);
  touched.add(file);
}
log(`主进程：套用 ${applied} 条替换${missing.length ? `，${missing.length} 条没有匹配（原文可能已随版本变化）` : ''}`);
for (const m of missing) log('  未匹配：' + m);

// --- wiring: stale guard + hub translation layer ----------------------------
function patchOnce(file, from, to, what) {
  const text = fs.readFileSync(file, 'utf8');
  const n = text.split(from).length - 1;
  if (n !== 1) fail(`${what}：在 ${path.relative(staging, file)} 里找到 ${n} 处待改位置（应为 1 处），原程序结构可能变了，需要更新脚本。`);
  fs.writeFileSync(file, text.replace(from, to));
  touched.add(file);
}

const mainJs = path.join(staging, ...asarPkg.main.split('/'));
fs.copyFileSync(path.join(PROJECT_ROOT, 'src', 'zh-guard.js'), path.join(path.dirname(mainJs), 'zh-guard.js'));
touched.add(path.join(path.dirname(mainJs), 'zh-guard.js'));
patchOnce(mainJs, '"use strict";\n', '"use strict";\nif (require("./zh-guard").redirectIfStale()) return; // antigravity-zh\n', '版本保护');

const preload = path.join(staging, 'dist', 'preload.js');
patchOnce(preload,
  "electron_1.ipcRenderer.invoke('window:show-context-menu', items)",
  "electron_1.ipcRenderer.invoke('window:show-context-menu', globalThis.__agyZhMenu ? globalThis.__agyZhMenu(items) : items)",
  '右键菜单翻译');
patchOnce(preload,
  "electron_1.ipcRenderer.invoke('notification:send', options)",
  "electron_1.ipcRenderer.invoke('notification:send', globalThis.__agyZhNotif ? globalThis.__agyZhNotif(options) : options)",
  '系统通知翻译');
const hubDict = readJson(path.join(PROJECT_ROOT, 'dict', 'hub.json'));
const entries = {};
for (const [k, v] of Object.entries(hubDict.entries)) if (typeof v === 'string' && v) entries[k] = v;
const runtimeSrc = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'hub-i18n.js'), 'utf8');
const PLACEHOLDER = '/*@AGY_ZH_DICT@*/ { entries: {} }';
if (runtimeSrc.split(PLACEHOLDER).length !== 2) fail('src/hub-i18n.js 里的词典占位符不是恰好一处。');
const runtime = runtimeSrc.replace(PLACEHOLDER, () => JSON.stringify({ entries }));
// Wrapped so a failure in the translation layer can never break the app's own preload.
fs.appendFileSync(preload, '\n;try {\n' + runtime + '\n} catch (e) { console.warn("[antigravity-zh] hub translation failed:", e); }\n');
log(`界面词典：${Object.keys(entries).length} 条`);

// --- syntax check ------------------------------------------------------------
for (const file of touched) {
  if (!file.endsWith('.js')) continue;
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    fail(`语法检查没通过：${file}\n${e.stderr?.toString() || e.message}`);
  }
}
log(`语法检查通过：${[...touched].filter((f) => f.endsWith('.js')).length} 个文件`);

// --- marker + swap -----------------------------------------------------------
fs.writeFileSync(path.join(staging, MARKER), JSON.stringify({
  tool: 'antigravity-zh',
  appliedAt: new Date().toISOString(),
  asarVersion: asarPkg.version,
  asarSize: fs.statSync(src).size,
  asarSha256: sha256File(src),
  mainRules: applied,
  mainRulesMissing: missing.length,
  hubEntries: Object.keys(entries).length,
}, null, 2));

const old = buildRoot ? path.join(buildRoot, 'app.zh-old') : p.old;
fs.rmSync(old, { recursive: true, force: true });
if (fs.existsSync(target)) {
  if (!buildRoot && !fs.existsSync(path.join(target, MARKER))) {
    fail(`${target} 已存在，但不是本脚本生成的，为安全起见不覆盖。请先确认它的来源。`);
  }
  fs.renameSync(target, old);
}
fs.renameSync(staging, target);
fs.rmSync(old, { recursive: true, force: true });
log(`已写入 ${target}`);

if (!args['no-plugin']) {
  const pluginDest = buildRoot ? path.join(buildRoot, 'plugins', pp.name) : pp.dir;
  const info = installPlugin(pp, pluginDest);
  log(`全局中文规则插件（${pp.name}${buildRoot ? '，预演' : ''}）：已写入 ${info.dir}`);
} else {
  log('已按 --no-plugin 跳过全局中文规则插件部署。');
}

if (!buildRoot && !args['no-rename'] && fs.existsSync(p.asar)) {
  // Back up the original package in the project before touching it.
  const backupDir = path.join(PROJECT_ROOT, 'tmp', 'backup', asarPkg.version);
  const backup = path.join(backupDir, 'app.asar');
  if (!fs.existsSync(backup) || sha256File(backup) !== sha256File(p.asar)) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(p.asar, backup);
  }
  if (fs.existsSync(p.asarBak)) {
    fs.rmSync(p.asarBak, { force: true }); // left over from the previous version
    log('已删除旧版本留下的 app.asar.bak');
  }
  const tryRenameAsar = () => {
    try {
      fs.renameSync(p.asar, p.asarBak);
      log(`已把 app.asar 改名为 app.asar.bak（原文件另备份在 ${backup}）`);
      return true;
    } catch (err) {
      if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) return false;
      throw err;
    }
  };
  if (!tryRenameAsar()) {
    if (args.wait) {
      log('检测到 Antigravity 当前正从 app.asar 运行并占用该文件。请关闭所有 Antigravity 窗口，脚本将在关闭后自动完成切换…');
      while (fs.existsSync(p.asar)) {
        await new Promise((r) => setTimeout(r, 300));
        if (tryRenameAsar()) break;
      }
    } else {
      warn(`${p.resourcesAppLabel} 汉化文件已生成完毕（原文件已备份在 ${backup}），但当前 Antigravity 正从更新后的 app.asar 运行并锁定了该文件，无法在运行中直接将 app.asar 改名为 app.asar.bak。`);
      warn(`请先关闭 Antigravity，再运行一次 ${p.applyScript} 完成最后一步切换。`);
      process.exit(2);
    }
  }
}

if (!buildRoot) process.exitCode = printStatus();
log('完成。' + (running.length ? '请重启 Antigravity 查看效果。' : ''));
