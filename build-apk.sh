#!/bin/bash
set -e

echo "==================================================="
echo "  CivicLens - Building Android APK (Capacitor)"
echo "==================================================="
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/app"

echo "[1/4] Building Vite Frontend..."
npx vite build

echo ""
echo "[2/4] Syncing Assets with Capacitor Native Android..."
npx cap sync android

echo ""
echo "[3/4] Checking Android SDK Location..."
cd android

if [ ! -f "local.properties" ]; then
    if [ -n "$ANDROID_HOME" ]; then
        echo "sdk.dir=$ANDROID_HOME" > local.properties
        echo "Created local.properties using ANDROID_HOME."
    elif [ -d "$HOME/Android/Sdk" ]; then
        echo "sdk.dir=$HOME/Android/Sdk" > local.properties
        echo "Created local.properties using default Android Studio SDK path."
    else
        echo "[WARNING] Android SDK path not found!"
        echo "Please set ANDROID_HOME or create 'app/android/local.properties' with:"
        echo "sdk.dir=/home/$USER/Android/Sdk"
        echo ""
    fi
fi

chmod +x gradlew

echo "[4/4] Compiling Android APK with Gradle..."
./gradlew assembleDebug

echo ""
echo "==================================================="
echo "  SUCCESS! APK built successfully."
echo "  Location:"
echo "  $SCRIPT_DIR/app/android/app/build/outputs/apk/debug/app-debug.apk"
echo "==================================================="
