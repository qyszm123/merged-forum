@echo off
REM 奇遇广场 · 本地一键启动（qyszm 风格 + kcsquare 架构）
cd /d %~dp0

start "backend" cmd /k "cd backend && npm run dev"
timeout /t 2 >nul
start "frontend" cmd /k "cd frontend && npm run dev"

echo 已启动后端(:3100) 与 前端(:5173)
echo 浏览器打开 http://localhost:5173
pause
