// Shared helpers for apply/restore/status.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MARKER = 'antigravity-zh.json';

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

export function installPaths(args = {}) {
  const base = args.install || process.env.ANTIGRAVITY_DIR ||
    path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'), 'Programs', 'antigravity');
  const resources = path.join(base, 'resources');
  return {
    base,
    exe: path.join(base, 'Antigravity.exe'),
    resources,
    asar: path.join(resources, 'app.asar'),
    asarBak: path.join(resources, 'app.asar.bak'),
    unpacked: path.join(resources, 'app.asar.unpacked'),
    app: path.join(resources, 'app'),
    staging: path.join(resources, 'app.zh-staging'),
    old: path.join(resources, 'app.zh-old'),
  };
}

// Minimal reader for Electron's asar format (same layout @electron/asar reads):
// [uint32 4][uint32 headerSize] then a pickle with [uint32 payload][uint32 len][json],
// file data starts at 8 + headerSize; unpacked files live in <asar>.unpacked/.
export function readAsarHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, 0);
    const headerSize = sizeBuf.readUInt32LE(4);
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 8);
    const strLen = headerBuf.readUInt32LE(4);
    const header = JSON.parse(headerBuf.toString('utf8', 8, 8 + strLen));
    return { header, dataOffset: 8 + headerSize };
  } finally {
    fs.closeSync(fd);
  }
}

export function readAsarFile(file, innerPath) {
  const { header, dataOffset } = readAsarHeader(file);
  let node = header;
  for (const part of innerPath.split('/')) {
    node = node.files && node.files[part];
    if (!node) throw new Error(`${innerPath} not found in ${file}`);
  }
  if (node.unpacked) return fs.readFileSync(path.join(file + '.unpacked', ...innerPath.split('/')));
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(node.size);
    fs.readSync(fd, buf, 0, node.size, dataOffset + Number(node.offset));
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

export function extractAsar(file, dest, unpackedDir = file + '.unpacked') {
  const { header, dataOffset } = readAsarHeader(file);
  const fd = fs.openSync(file, 'r');
  let count = 0;
  try {
    const visit = (node, rel) => {
      for (const [name, entry] of Object.entries(node.files || {})) {
        const childRel = rel ? `${rel}/${name}` : name;
        const out = path.join(dest, ...childRel.split('/'));
        if (entry.files) {
          fs.mkdirSync(out, { recursive: true });
          visit(entry, childRel);
        } else if (entry.link) {
          throw new Error(`symlink entries are not supported: ${childRel}`);
        } else {
          fs.mkdirSync(path.dirname(out), { recursive: true });
          if (entry.unpacked) {
            fs.copyFileSync(path.join(unpackedDir, ...childRel.split('/')), out);
          } else {
            const buf = Buffer.alloc(entry.size);
            if (entry.size > 0) fs.readSync(fd, buf, 0, entry.size, dataOffset + Number(entry.offset));
            fs.writeFileSync(out, buf);
          }
          count++;
        }
      }
    };
    fs.mkdirSync(dest, { recursive: true });
    visit(header, '');
  } finally {
    fs.closeSync(fd);
  }
  return count;
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Which original asar to read: app.asar normally, app.asar.bak in rename mode.
export function originalAsar(p) {
  if (fs.existsSync(p.asar)) return p.asar;
  if (fs.existsSync(p.asarBak)) return p.asarBak;
  return null;
}

function asarVersion(file) {
  try {
    return JSON.parse(readAsarFile(file, 'package.json').toString('utf8')).version;
  } catch {
    return null;
  }
}

export function status(p) {
  const res = {
    asarExists: fs.existsSync(p.asar),
    bakExists: fs.existsSync(p.asarBak),
    app: fs.existsSync(p.app),
    asarVersion: null,
    bakVersion: null,
    appVersion: null,
    marker: null,
  };
  if (res.asarExists) res.asarVersion = asarVersion(p.asar);
  if (res.bakExists) res.bakVersion = asarVersion(p.asarBak);
  if (res.app) {
    try {
      res.appVersion = readJson(path.join(p.app, 'package.json')).version;
    } catch {}
    try {
      res.marker = readJson(path.join(p.app, MARKER));
    } catch {}
  }
  return res;
}

// Antigravity.exe processes that are the desktop app (not ELECTRON_RUN_AS_NODE helpers).
export async function runningAppProcesses(exePath) {
  const { execFileSync } = await import('node:child_process');
  try {
    const ps = "Get-CimInstance Win32_Process -Filter \"Name='Antigravity.exe'\" | ForEach-Object { '' + $_.ProcessId + \"`t\" + $_.ExecutablePath + \"`t\" + $_.CommandLine }";
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).filter(Boolean).map((l) => {
      const [pid, exe, cmd = ''] = l.split('\t');
      return { pid: Number(pid), exe, cmd };
    }).filter((p) => (!exePath || (p.exe || '').toLowerCase() === exePath.toLowerCase()) &&
      !/--type=/.test(p.cmd) && !/\.(m?js|cjs)\b/i.test(p.cmd));
  } catch {
    return [];
  }
}
