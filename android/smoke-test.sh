#!/usr/bin/env bash
# Runs inside a booted Android emulator (see .github/workflows/android-smoke.yml), never on a real phone.
# Installs the APK named by the first argument, opens the app, waits 15 seconds, then checks that the app is
# still running and in front, that its page loaded and that nothing crashed. A screenshot and the phone's log
# are saved in android/smoke-output/ whether the checks pass or not.
set -uo pipefail

apk="${1:?Usage: smoke-test.sh Soundboard.apk}"
app_id=io.github.ghuumiruma.soundboard
out="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/smoke-output"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
mkdir -p "$out"

failed=0
fail() {
  echo "::error::$1"
  failed=1
}
# adb shell without the carriage returns some Android versions add to the output.
phone() { adb shell "$@" | tr -d '\r'; }

android="$(phone getprop ro.build.version.release) (API $(phone getprop ro.build.version.sdk))"
webview="$(phone dumpsys webviewupdate | sed -n 's/.*Current WebView package (name, version): (\(.*\)).*/\1/p')"
echo "Emulator: Android $android, WebView ${webview:-unknown}"

adb install -r "$apk" || { echo "::error::The emulator would not install $apk."; exit 1; }
adb logcat -c
start="$(phone am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$app_id/$app_id.MainActivity")"
printf '%s\n' "$start"
grep -q '^Status: ok' <<< "$start" || fail "Android could not open Soundboard."
sleep 15

adb exec-out screencap -p > "$out/soundboard.png"
adb logcat -d > "$out/logcat.txt"

pid="$(phone pidof "$app_id" | awk '{ print $1 }')"
if [ -n "$pid" ]; then
  echo "Soundboard is running (process $pid)."
else
  fail "Soundboard is no longer running 15 seconds after it was opened."
fi

focus="$(phone dumpsys window | grep -E 'mCurrentFocus|mFocusedApp')"
printf '%s\n' "$focus"
grep -Fq "$app_id/" <<< "$focus" || fail "Soundboard is not the app on screen. The screenshot shows what is."

if grep -Eq "Process: $app_id, PID|ANR in $app_id" "$out/logcat.txt"; then
  grep -E -A12 "Process: $app_id, PID|ANR in $app_id" "$out/logcat.txt" | head -n 40
  fail "Soundboard crashed or stopped responding. The details are in logcat.txt in the attached files."
fi

# The WebView lists the page it is showing on its debugging socket (capacitor.config.ts turns that on).
page_url=
page_title=
if [ -n "$pid" ]; then
  if adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid" > /dev/null; then
    pages="$(curl -fsS --max-time 10 http://127.0.0.1:9222/json/list || true)"
    printf '%s\n' "$pages" > "$out/pages.json"
    page_url="$(jq -r '[.[] | select(.type == "page")][0].url // empty' <<< "$pages" 2> /dev/null || true)"
    page_title="$(jq -r '[.[] | select(.type == "page")][0].title // empty' <<< "$pages" 2> /dev/null || true)"
  fi
  case "$page_url" in
    https://localhost | https://localhost/*) echo "The page is open: ${page_title:-no title} ($page_url)" ;;
    *) fail "Soundboard's page did not load: the app is showing '${page_url:-nothing}'." ;;
  esac
fi

if [ "$failed" = 0 ]; then result=passed; else result=FAILED; fi
{
  echo "### Android emulator check: $result"
  echo "- Emulator: Android $android, WebView ${webview:-unknown}"
  echo "- App process: ${pid:-not running}"
  echo "- Page: ${page_title:-none} at ${page_url:-nowhere}"
  echo "- The screenshot and the phone's log are in the attached files (Soundboard-emulator)."
} >> "$summary"
exit "$failed"
