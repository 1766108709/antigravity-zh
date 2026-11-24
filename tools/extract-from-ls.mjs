// Extract the Hub main.js bundle directly from resources/bin/language_server.exe.
// Usage: node tools/extract-from-ls.mjs [outFile] [--install <dir>]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PROJECT_ROOT, parseArgs, installPaths } from '../scripts/lib.mjs';

const args = parseArgs(process.argv.slice(2));
const paths = installPaths(args);
const binPath = path.join(paths.resources, 'bin', 'language_server.exe');
const outPath = args._[0] ? path.resolve(args._[0]) : path.join(PROJECT_ROOT, 'tmp', 'main-latest.js');

if (!fs.existsSync(binPath)) {
  console.error('找不到文件：' + binPath);
  process.exit(1);
}

const buf = fs.readFileSync(binPath);
const target = Buffer.from('main.js');
let searchFrom = 0;
let extracted = null;

while (searchFrom < buf.length) {
  const hdrPos = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), searchFrom);
  if (hdrPos === -1 || hdrPos + 30 > buf.length) break;
  const method = buf.readUInt16LE(hdrPos + 8);
  let compSize = buf.readUInt32LE(hdrPos + 18);
  const nameLen = buf.readUInt16LE(hdrPos + 26);
  const extraLen = buf.readUInt16LE(hdrPos + 28);
  if (nameLen === target.length && hdrPos + 30 + nameLen <= buf.length &&
      buf.subarray(hdrPos + 30, hdrPos + 30 + nameLen).equals(target)) {
    const dataStart = hdrPos + 30 + nameLen + extraLen;
    if (compSize === 0) {
      let cdFrom = dataStart;
      while (cdFrom < buf.length) {
        const cdPos = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), cdFrom);
        if (cdPos === -1 || cdPos + 46 > buf.length) break;
        const cdNameLen = buf.readUInt16LE(cdPos + 28);
        if (cdNameLen === target.length && buf.subarray(cdPos + 46, cdPos + 46 + cdNameLen).equals(target)) {
          compSize = buf.readUInt32LE(cdPos + 20);
          break;
        }
        cdFrom = cdPos + 4;
      }
    }
    if (compSize > 0 && dataStart + compSize <= buf.length) {
      const comp = buf.subarray(dataStart, dataStart + compSize);
      extracted = method === 8 ? zlib.inflateRawSync(comp) : method === 0 ? comp : null;
      if (extracted) break;
    }
  }
  searchFrom = hdrPos + 4;
}

if (!extracted) {
  console.error('未能从 language_server.exe 中提取 main.js（资源格式可能已变化）。');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, extracted);
console.log(`已提取 main.js（${extracted.length} 字节）-> ${outPath}`);
