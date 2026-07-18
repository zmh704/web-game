@echo off
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-11.0.31.11-hotspot
echo JAVA_HOME=%JAVA_HOME%
set PROJECT_DIR=d:\File\workspace\web-game\android\____\android\source
echo Running gradlew from %PROJECT_DIR%...
"%PROJECT_DIR%\gradlew.bat" -p "%PROJECT_DIR%" clean assembleDebug
pause