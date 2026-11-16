// Writes apply.cmd / restore.cmd / check.cmd (CRLF) in the project root.
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const mk = (script, args, pauseAlways) => [
  '@echo off',
  'chcp 65001 >nul',
  'where node >nul 2>nul || (echo 需要先安装 Node.js 18 或更高版本。& pause & exit /b 1)',
  `node "%~dp0scripts\\${script}" ${args}`,
  'set RC=%ERRORLEVEL%',
  pauseAlways ? 'pause' : 'if "%~1"=="" pause',
  'exit /b %RC%',
  '',
].join('\r\n');
fs.writeFileSync(new URL('apply.cmd', root), mk('apply.mjs', '%*'));
fs.writeFileSync(new URL('restore.cmd', root), mk('restore.mjs', '%*'));
fs.writeFileSync(new URL('check.cmd', root), mk('apply.mjs', '--check', true));
console.log('written');
