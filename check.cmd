@echo off
chcp 65001 >nul
where node >nul 2>nul || (echo 需要先安装 Node.js 18 或更高版本。& pause & exit /b 1)
node "%~dp0scripts\apply.mjs" --check
set RC=%ERRORLEVEL%
pause
exit /b %RC%
