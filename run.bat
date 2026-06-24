@echo off
title Trinh Quan Ly Nhom Zalo Ca Nhan - Khoa Media

echo =====================================================================
echo          TRINH QUAN LY NHOM ZALO CA NHAN - KHOA MEDIA
echo =====================================================================
echo(

rem 1. Kiem tra Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js tren may tinh cua ban!
    echo Vui long tai va cai dat Node.js tai: https://nodejs.org/
    echo Sau khi cai dat xong, hay mo lai file run.bat.
    echo(
    pause
    exit /b
)

rem Di chuyen vao thu muc server
cd /d "%~dp0server"

rem 2. Kiem tra va cai dat node_modules
set NEED_INSTALL=0
if not exist node_modules (
    set NEED_INSTALL=1
    goto :INSTALL_DEPENDENCIES
)

node -e "const pkg = require('./package.json'); Object.keys(pkg.dependencies || {}).forEach(require.resolve);" >nul 2>&1
if errorlevel 1 (
    set NEED_INSTALL=1
)

:INSTALL_DEPENDENCIES
if "%NEED_INSTALL%"=="1" (
    echo [THONG BAO] Khong tim thay hoac thieu thu vien trong thu muc node_modules.
    echo Dang tien hanh cai dat cac thu vien. Vui long cho...
    echo(
    
    where pnpm >nul 2>&1
    if errorlevel 1 (
        echo [THONG BAO] Dang cai dat thu vien bang npm...
        call npm install
        if errorlevel 1 (
            echo(
            echo [LOI] Cai dat thu vien that bai!
            echo Vui long kiem tra ket noi mang hoac chay CMD duoi quyen Administrator.
            pause
            exit /b
        )
    ) else (
        echo [THONG BAO] Tim thay pnpm, dang tien hanh cai dat...
        call pnpm install
        if errorlevel 1 (
            echo(
            echo [CANH BAO] pnpm install gap loi, thuong do khoa file hoac quyen EPERM tren Windows.
            echo Dang tu dong chuyen sang cai dat bang npm de dam bao do on dinh...
            echo(
            call npm install
            if errorlevel 1 (
                echo(
                echo [LOI] Cai dat thu vien bang npm cung that bai!
                pause
                exit /b
            )
        )
    )
    echo(
    echo [THONG BAO] Cai dat thu vien thanh cong!
    echo(
)

rem 3. Mo trang Web Dashboard
echo [THONG BAO] Dang mo trinh duyet tai dia chi http://localhost:3000 ...
start http://localhost:3000

rem 4. Khoi chay server
echo [THONG BAO] Dang khoi dong server...
echo Nhan Ctrl+C de dung chay.
echo ---------------------------------------------------------------------
node server.js

pause
