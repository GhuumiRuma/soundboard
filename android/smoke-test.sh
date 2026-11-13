#!/usr/bin/env bash
# Runs inside a booted Android emulator (see .github/workflows/android-smoke.yml), never on a real phone.
# Installs the APK named by the first argument, opens the app, waits 15 seconds, then checks that the app is
# still running and in front, that its page loaded and that nothing crashed. Then it does what a person might:
# switches the phone to dark mode and turns it on its side, and checks the app follows without starting over.
# Screenshots of each stage and the phone's log are saved in android/smoke-output/ whether the checks pass or not.
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

# Saves the phone's log and fails if the app crashed or stopped responding.
check_log() {
  adb logcat -d > "$out/logcat.txt"
  if grep -Eq "Process: $app_id, PID|ANR in $app_id" "$out/logcat.txt"; then
    grep -E -A12 "Process: $app_id, PID|ANR in $app_id" "$out/logcat.txt" | head -n 40
    fail "Soundboard crashed or stopped responding. The details are in logcat.txt in the attached files."
  fi
}

# The WebView describes its page on its debugging socket (capacitor.config.ts turns that on). The id stays the
# same until the page is rebuilt; the width and height are the part of the screen the page has.
first_page=
turned="not checked"
page_id=
page_width=
page_height=
look_at_page() {
  local pages
  pages="$(curl -fsS --max-time 10 http://127.0.0.1:9222/json/list || true)"
  page_id="$(jq -r '[.[] | select(.type == "page")][0].id // empty' <<< "$pages" 2> /dev/null || true)"
  read -r page_width page_height <<< "$(jq -r '[.[] | select(.type == "page")][0].description // empty | fromjson | "\(.width) \(.height)"' <<< "$pages" 2> /dev/null || true)"
}

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

pid="$(phone pidof "$app_id" | awk '{ print $1 }')"
if [ -n "$pid" ]; then
  echo "Soundboard is running (process $pid)."
else
  fail "Soundboard is no longer running 15 seconds after it was opened."
fi

focus="$(phone dumpsys window | grep -E 'mCurrentFocus|mFocusedApp')"
printf '%s\n' "$focus"
grep -Fq "$app_id/" <<< "$focus" || fail "Soundboard is not the app on screen. The screenshot shows what is."

check_log

# The page the WebView is showing, from its debugging socket.
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

# Switch the phone to dark mode, as if in Settings, then turn it on its side. Neither may start the app over,
# which would cut off a sound that is playing, and the app may not refuse to turn.
if [ -n "$pid" ] && [ -n "$page_url" ]; then
  look_at_page
  first_page="$page_id"
  phone cmd uimode night yes
  sleep 5
  adb exec-out screencap -p > "$out/soundboard-dark.png"
  adb shell settings put system accelerometer_rotation 0
  adb shell settings put system user_rotation 1
  sleep 5
  adb exec-out screencap -p > "$out/soundboard-landscape.png"
  look_at_page
  turned="${page_width:-?} x ${page_height:-?}"
  echo "The page was ${first_page:-missing} and is now ${page_id:-missing}, $turned on its side."
  [ "$(phone pidof "$app_id" | awk '{ print $1 }')" = "$pid" ] \
    || fail "Soundboard stopped or started over when the phone went dark or was turned on its side."
  { [ -n "$first_page" ] && [ "$page_id" = "$first_page" ]; } \
    || fail "Soundboard's page started over when the phone went dark or was turned on its side."
  [ "${page_width:-0}" -gt "${page_height:-0}" ] \
    || fail "Soundboard did not turn onto its side when the phone did."
  check_log
fi

if [ "$failed" = 0 ]; then result=passed; else result=FAILED; fi
{
  echo "### Android emulator check: $result"
  echo "- Emulator: Android $android, WebView ${webview:-unknown}"
  echo "- App process: ${pid:-not running}"
  echo "- Page: ${page_title:-none} at ${page_url:-nowhere}"
  echo "- Switched to dark mode, then turned on its side: page $turned"
  echo "- Screenshots (light, dark, on its side) and the phone's log are in the attached files (Soundboard-emulator)."
} >> "$summary"
exit "$failed"
