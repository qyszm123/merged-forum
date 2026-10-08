@echo off
chcp 65001 >nul
title Qiyu Square - Start All (MySQL + Backend + Frontend)

cd /d "%~dp0"

echo ==========================================
echo   Qiyu Square - one-click start
echo   MySQL :3306 / Backend :3101 / Frontend :5173
echo ==========================================
echo.

echo [1/3] Starting MySQL (port 3306) ...
start "MySQL" /min "C:\Users\Administrator\mysql-8.0.28-winx64\bin\mysqld.exe" --defaults-file=C:\Users\Administrator\mysql-8.0.28-winx64\my.ini
timeout /t 8 /nobreak >nul

echo [2/3] Starting backend (port 3101) ...
pushd "%~dp0backend"
start "backend" cmd /k "npm run dev"
popd
timeout /t 3 /nobreak >nul

echo [3/3] Starting frontend (port 5173) ...
pushd "%~dp0frontend"
start "frontend" cmd /k "npm run dev"
popd

echo.
echo All started.
echo   Open in browser: http://localhost:5173
echo   Keep the "backend" and "frontend" windows open.
echo   (First run may take ~20s while Vite re-optimizes dependencies.)
echo.
pause
