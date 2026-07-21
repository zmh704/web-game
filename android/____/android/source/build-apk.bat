@echo off
chcp 65001 >nul
echo ========== 同步游戏文件到 Android assets ==========
set SRC_DIR=d:\File\workspace\web-game
set ASSETS_DIR=d:\File\workspace\web-game\android\____\android\source\app\src\main\assets

echo 1. 复制 game.html ...
copy /Y "%SRC_DIR%\game.html" "%ASSETS_DIR%\game.html" >nul

echo 2. 复制 src/scripts/*.js ...
xcopy /Y /E /I "%SRC_DIR%\src\scripts\*.js" "%ASSETS_DIR%\src\scripts\" >nul

echo 3. 复制 src/styles/*.css ...
xcopy /Y /E /I "%SRC_DIR%\src\styles\*.css" "%ASSETS_DIR%\src\styles\" >nul

echo 4. 复制 src/data/*.js ...
xcopy /Y /E /I "%SRC_DIR%\src\data\*.js" "%ASSETS_DIR%\src\data\" >nul

echo 5. 复制 src/assets/audio/*.mp3 ...
if not exist "%ASSETS_DIR%\src\assets\audio\" mkdir "%ASSETS_DIR%\src\assets\audio\"
copy /Y "%SRC_DIR%\src\assets\audio\*.mp3" "%ASSETS_DIR%\src\assets\audio\" >nul

echo 6. 复制 icons ...
xcopy /Y /E /I "%SRC_DIR%\icons\*.*" "%ASSETS_DIR%\icons\" >nul

echo 7. 复制 manifest.json ...
copy /Y "%SRC_DIR%\manifest.json" "%ASSETS_DIR%\manifest.json" >nul

echo 8. 复制 sw.js ...
copy /Y "%SRC_DIR%\sw.js" "%ASSETS_DIR%\sw.js" >nul

echo.
echo ========== 文件同步完成，开始构建 APK ==========
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-11.0.31.11-hotspot
echo JAVA_HOME=%JAVA_HOME%
set PROJECT_DIR=%ASSETS_DIR%\..
set PROJECT_DIR=d:\File\workspace\web-game\android\____\android\source
echo Running gradlew from %PROJECT_DIR%...
"%PROJECT_DIR%\gradlew.bat" -p "%PROJECT_DIR%" clean assembleDebug
echo.
if exist "%PROJECT_DIR%\app\build\outputs\apk\debug\app-debug.apk" (
    echo ✅ APK 生成成功!
    echo 文件位置: %PROJECT_DIR%\app\build\outputs\apk\debug\app-debug.apk
) else (
    echo ❌ APK 生成失败，请检查错误信息
)
pause
