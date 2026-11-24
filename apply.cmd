@echo off
chcp 65001 >nul
where node >nul 2>nul || (echo 需要先安装 Node.js 18 或更高版本。& pause & exit /b 1)
if "%~1"=="" (
  node "%~dp0scripts\apply.mjs" --wait
) else (
  node "%~dp0scripts\apply.mjs" %*
)
set RC=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %RC%
