@echo off
chcp 65001 >nul
echo ========================================
echo   游戏音频服务器启动中...
echo ========================================
echo.
echo 请选择启动方式：
echo.
echo [1] Python HTTP 服务器（推荐）
echo [2] Node.js HTTP 服务器
echo [3] 直接说明手动启动方法
echo.

set /p choice=请输入选项 (1/2/3): 

if "%choice%"=="1" goto python
if "%choice%"=="2" goto nodejs
if "%choice%"=="3" goto manual
goto end

:python
echo.
echo 正在启动 Python HTTP 服务器...
echo 服务器地址: http://localhost:8000
echo 按 Ctrl+C 停止服务器
echo.
python -m http.server 8000
goto end

:nodejs
echo.
echo 正在启动 Node.js HTTP 服务器（simple-server.js）...
echo 服务器地址: http://localhost:3000
echo 按 Ctrl+C 停止服务器
echo.
node simple-server.js
goto end

:manual
echo.
echo ========================================
echo   手动启动方法：
echo ========================================
echo.
echo 方法1 - Python:
echo   1. 打开命令提示符（CMD）
echo   2. 进入游戏目录：cd /d "%~dp0"
echo   3. 运行：python -m http.server 8000
echo   4. 浏览器访问：http://localhost:8000
echo.
echo 方法2 - Node.js (simple-server.js):
echo   1. 运行：node simple-server.js
echo   2. 浏览器访问：http://localhost:3000
echo.
echo 方法3 - VS Code:
echo   1. 安装 Live Server 扩展
echo   2. 右键点击 game.html
echo   3. 选择 "Open with Live Server"
echo.
goto end

:end
pause