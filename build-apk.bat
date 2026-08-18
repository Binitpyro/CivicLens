@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   CivicLens - Building Android APK (Capacitor)
echo ===================================================
echo.

cd /d "%~dp0app"

echo [1/4] Building Vite Frontend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Vite frontend build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/4] Syncing Assets with Capacitor Native Android...
call npx cap sync android
if %errorlevel% neq 0 (
    echo [ERROR] Capacitor sync failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [3/4] Checking Android SDK Location...
cd android

if not exist "local.properties" (
    if defined ANDROID_HOME (
        echo sdk.dir=!ANDROID_HOME:\=\\! > local.properties
        echo Created local.properties using ANDROID_HOME.
    ) else if exist "%LOCALAPPDATA%\Android\Sdk" (
        echo sdk.dir=%LOCALAPPDATA:\=\\%\\Android\\Sdk > local.properties
        echo Created local.properties using default Android Studio SDK path.
    ) else (
        echo [WARNING] Android SDK path not found!
        echo Please set ANDROID_HOME or create 'app\android\local.properties' with:
        echo sdk.dir=C\:\\Users\\%USERNAME%\\AppData\\Local\\Android\\Sdk
        echo.
    )
)

echo [4/4] Compiling Android APK with Gradle...
call gradlew.bat assembleDebug
if %errorlevel% neq 0 (
    echo [ERROR] Gradle build failed! Ensure Android SDK / Android Studio is installed.
    pause
    exit /b %errorlevel%
)

echo.
echo ===================================================
echo   SUCCESS! APK built successfully.
echo   Location:
echo   %~dp0app\android\app\build\outputs\apk\debug\app-debug.apk
echo ===================================================
echo.
pause
