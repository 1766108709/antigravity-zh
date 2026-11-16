/* antigravity-zh: stale-layer guard, required from the top of dist/main.js.
 * resources\app is loaded before resources\app.asar. The auto-updater only
 * replaces app.asar, so after an update this folder would still hold the old
 * version. When the versions (or the app.asar size recorded at apply time)
 * differ, load the updated app.asar instead of the stale translated copy.
 */
'use strict';
const path = require('path');
const fs = require('fs');
// Electron's patched fs treats app.asar as a directory; original-fs sees the real file.
let ofs = fs;
try {
  ofs = require('original-fs');
} catch {}

exports.redirectIfStale = function redirectIfStale() {
  const asarDir = path.join(process.resourcesPath, 'app.asar');
  let asarPkg;
  let asarSize;
  try {
    asarSize = ofs.statSync(asarDir).size;
    asarPkg = JSON.parse(fs.readFileSync(path.join(asarDir, 'package.json'), 'utf8'));
  } catch {
    return false; // no app.asar next to us (rename mode): nothing to compare
  }
  let marker = {};
  try {
    marker = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'antigravity-zh.json'), 'utf8'));
  } catch {}
  const own = require('../package.json');
  const sizeChanged = typeof marker.asarSize === 'number' && marker.asarSize !== asarSize;
  if (asarPkg.version === own.version && !sizeChanged) return false;
  console.warn(`[antigravity-zh] resources\\app is ${own.version} but app.asar is ${asarPkg.version}` +
    (sizeChanged ? ' (app.asar changed)' : '') + '; loading app.asar. Re-run apply.cmd to translate the new version.');
  const { app } = require('electron');
  if (typeof app.setVersion === 'function') app.setVersion(asarPkg.version);
  require(path.join(asarDir, asarPkg.main || 'dist/main.js'));
  return true;
};
