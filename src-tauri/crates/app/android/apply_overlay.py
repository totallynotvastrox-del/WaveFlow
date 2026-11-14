#!/usr/bin/env python3
"""Lay WaveFlow's Android pieces over the project `tauri android init` generates.

`gen/android` is generated and not committed, so what the app adds to it
lives here and is applied after every `init`:

- the activity, the playback service and its JNI bridge (Kotlin);
- the notification glyph;
- the manifest entries they need (permissions, the service, storage flags).

Usage: apply_overlay.py <path to gen/android>
"""

import re
import shutil
import sys
from pathlib import Path

PACKAGE = "app.waveflow.unofficial"
HERE = Path(__file__).resolve().parent

PERMISSIONS = [
    ("android.permission.INTERNET", ""),
    ("android.permission.ACCESS_NETWORK_STATE", ""),
    ("android.permission.ACCESS_WIFI_STATE", ""),
    # SSDP discovery for the DLNA server.
    ("android.permission.CHANGE_WIFI_MULTICAST_STATE", ""),
    ("android.permission.FOREGROUND_SERVICE", ""),
    ("android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK", ""),
    ("android.permission.POST_NOTIFICATIONS", ""),
    ("android.permission.WAKE_LOCK", ""),
    # The scanner and the decoder read real paths, and the tag editor
    # writes them: "All files access" on Android 11+, the classic pair
    # before it.
    ("android.permission.MANAGE_EXTERNAL_STORAGE", ""),
    ("android.permission.READ_EXTERNAL_STORAGE", ' android:maxSdkVersion="32"'),
    ("android.permission.WRITE_EXTERNAL_STORAGE", ' android:maxSdkVersion="29"'),
    ("android.permission.READ_MEDIA_AUDIO", ""),
]

SERVICE = """
        <service
            android:name=".PlaybackService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
"""


def patch_manifest(path: Path) -> None:
    text = path.read_text()

    missing = [
        f'    <uses-permission android:name="{name}"{extra} />'
        for name, extra in PERMISSIONS
        if f'android:name="{name}"' not in text
    ]
    if missing:
        text = re.sub(
            r"(\s*)<application\b",
            lambda m: "\n" + "\n".join(missing) + "\n" + m.group(1).lstrip("\n") + "<application",
            text,
            count=1,
        )

    # Cover art and radio logos are loaded by the webview from whatever
    # address the metadata names, plain http included.
    text = re.sub(r'android:usesCleartextTraffic="[^"]*"', 'android:usesCleartextTraffic="true"', text)
    extra = []
    if "usesCleartextTraffic" not in text:
        extra.append('android:usesCleartextTraffic="true"')
    if "requestLegacyExternalStorage" not in text:
        extra.append('android:requestLegacyExternalStorage="true"')
    if extra:
        text = text.replace("<application", "<application\n        " + "\n        ".join(extra), 1)

    # One task, one activity: reopening from the notification must come
    # back to the running instance, never start a second engine.
    if "android:launchMode" in text:
        text = re.sub(r'android:launchMode="[^"]*"', 'android:launchMode="singleTask"', text)
    else:
        text = text.replace("<activity", '<activity\n            android:launchMode="singleTask"', 1)

    if ".PlaybackService" not in text:
        text = text.replace("</application>", SERVICE + "    </application>", 1)

    path.write_text(text)


def main() -> None:
    gen = Path(sys.argv[1]).resolve()
    main_dir = gen / "app" / "src" / "main"
    java_dir = main_dir / "java" / Path(*PACKAGE.split("."))
    if not java_dir.is_dir():
        found = [str(p) for p in (main_dir / "java").rglob("MainActivity.kt")]
        sys.exit(f"expected {java_dir}; MainActivity.kt found at: {found}")

    for source in sorted((HERE / "kotlin").glob("*.kt")):
        shutil.copy2(source, java_dir / source.name)
        print(f"kotlin   {source.name}")

    for source in sorted((HERE / "res").rglob("*")):
        if source.is_file():
            target = main_dir / "res" / source.relative_to(HERE / "res")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            print(f"res      {source.relative_to(HERE / 'res')}")

    patch_manifest(main_dir / "AndroidManifest.xml")
    print("manifest patched")

    rules = gen / "app" / "proguard-rules.pro"
    keep = f"-keep class {PACKAGE}.** {{ *; }}\n"
    current = rules.read_text() if rules.exists() else ""
    if keep not in current:
        rules.write_text(current + ("\n" if current and not current.endswith("\n") else "") + keep)
        print("proguard rule added")


if __name__ == "__main__":
    main()
