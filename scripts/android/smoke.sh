#!/usr/bin/env bash
# Install the APK on the running emulator, give it what a user would
# grant by hand, put a few tagged test tracks on shared storage and run
# the steps. Usage: smoke.sh <apk> <steps file> <output dir>
set -u
apk="$1"; steps="$2"; out="$3"
pkg=app.waveflow.unofficial
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out"

adb install -r "$apk"
adb shell appops set "$pkg" MANAGE_EXTERNAL_STORAGE allow
adb shell pm grant "$pkg" android.permission.POST_NOTIFICATIONS || true
adb shell settings put system screen_off_timeout 1800000
adb shell mkdir -p /sdcard/Music/Smoke
adb push testmusic/. /sdcard/Music/Smoke/ >/dev/null
adb shell ls -la /sdcard/Music/Smoke
adb logcat -c
adb shell am start -W -n "$pkg/.MainActivity"

status=0
python3 "$here/smoke.py" "$steps" "$out" || status=$?

adb logcat -d > "$out/logcat.txt"
echo "::group::app log"
grep -E "RustStdoutStderr|AndroidRuntime|FATAL|chromium|Console|WaveFlow|waveflow|tauri|Tauri|DEBUG   :|libc    :" "$out/logcat.txt" | tail -n 400 | cut -c1-400
echo "::endgroup::"
echo "::group::media session and service"
adb shell dumpsys media_session | grep -A14 "$pkg" | head -60
adb shell dumpsys activity services "$pkg" | head -40
echo "::endgroup::"
exit "$status"
