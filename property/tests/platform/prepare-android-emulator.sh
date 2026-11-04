#!/usr/bin/env bash
set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [[ -z "$SDK_ROOT" ]]; then
  echo 'ANDROID_SDK_ROOT or ANDROID_HOME is required.' >&2
  exit 2
fi
SDKMANAGER="${SDKMANAGER:-$(command -v sdkmanager || true)}"
if [[ -z "$SDKMANAGER" ]]; then
  for candidate in "$SDK_ROOT"/cmdline-tools/*/bin/sdkmanager; do
    if [[ -x "$candidate" ]]; then SDKMANAGER="$candidate"; break; fi
  done
fi
AVDMANAGER="${AVDMANAGER:-$(command -v avdmanager || true)}"
if [[ -z "$AVDMANAGER" && -n "$SDKMANAGER" ]]; then
  candidate="$(dirname "$SDKMANAGER")/avdmanager"
  [[ ! -x "$candidate" ]] || AVDMANAGER="$candidate"
fi
EMULATOR="${EMULATOR:-$(command -v emulator || true)}"
[[ -x "$EMULATOR" ]] || EMULATOR="$SDK_ROOT/emulator/emulator"
ADB="${ADB:-$(command -v adb || true)}"
[[ -x "$ADB" ]] || ADB="$SDK_ROOT/platform-tools/adb"
for name in SDKMANAGER AVDMANAGER EMULATOR ADB; do
  if [[ ! -x "${!name}" ]]; then printf 'Android SDK component %s is missing: %s\n' "$name" "${!name}" >&2; exit 2; fi
done
export PATH="$(dirname "$SDKMANAGER"):$(dirname "$AVDMANAGER"):$(dirname "$EMULATOR"):$(dirname "$ADB"):$PATH"

IMAGE='system-images;android-35;google_apis_playstore;x86_64'
AVD='property-g12-api35'
DEVICE='pixel_6'
set +o pipefail
yes | "$SDKMANAGER" --sdk_root="$SDK_ROOT" --licenses >/dev/null
set -o pipefail
set +o pipefail
yes | "$SDKMANAGER" --sdk_root="$SDK_ROOT" --install emulator platform-tools 'platforms;android-35' "$IMAGE"
set -o pipefail
printf 'no\n' | "$AVDMANAGER" create avd --force --name "$AVD" --package "$IMAGE" --device "$DEVICE"
"$EMULATOR" -avd "$AVD" -port 5554 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot -wipe-data -no-metrics >"${RUNNER_TEMP:-/tmp}/property-android-emulator.log" 2>&1 &
EMULATOR_PID=$!
UDID='emulator-5554'
READY=0
for _ in $(seq 1 240); do
  STATE="$("$ADB" -s "$UDID" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  if [[ "$STATE" == '1' ]]; then READY=1; break; fi
  sleep 1
done
if [[ "$READY" != '1' ]]; then tail -80 "${RUNNER_TEMP:-/tmp}/property-android-emulator.log" >&2; exit 1; fi
"$ADB" -s "$UDID" shell settings put global window_animation_scale 0
"$ADB" -s "$UDID" shell settings put global transition_animation_scale 0
"$ADB" -s "$UDID" shell settings put global animator_duration_scale 0
ANDROID_RELEASE="$("$ADB" -s "$UDID" shell getprop ro.build.version.release | tr -d '\r')"
ANDROID_API="$("$ADB" -s "$UDID" shell getprop ro.build.version.sdk | tr -d '\r')"
[[ "$ANDROID_API" == '35' ]]
OUT="${1:-g12-platform-device-preparation.json}"
node - "$OUT" "$ANDROID_RELEASE" "$ANDROID_API" "$IMAGE" "$AVD" "$UDID" "$EMULATOR_PID" <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
const [output, release, api, image, avd, udid, pid] = process.argv.slice(2);
const report = { schema_version: 1, kind: 'android-emulator-preparation', result: 'PASS',
  release, api_level: Number(api), system_image: image, avd, transport: 'adb emulator',
  udid_sha256: crypto.createHash('sha256').update(udid).digest('hex'), emulator_process_started: Number(pid) > 0 };
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV,
  `PROPERTY_DEVICE_UDID=${udid}\nPROPERTY_DEVICE_NAME=Property Android API ${api}\nPROPERTY_PLATFORM_VERSION=${release}\nPROPERTY_DEVICE_KIND=emulator\n`);
process.stdout.write(JSON.stringify({ result: report.result, release, api_level: report.api_level, avd }) + '\n');
NODE
