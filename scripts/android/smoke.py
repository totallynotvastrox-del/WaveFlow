#!/usr/bin/env python3
"""Drive the installed APK on an emulator and record what it shows.

A smoke test for the Android port, run by `.github/workflows/android.yml`
inside the emulator step. It reads a list of steps (one per line):

    wait <seconds>
    shot <name>            screenshot into the output folder
    dump <name>            the texts on screen, into the log and a file
    tap <regex>            tap the first element whose text or
                           description matches (not fatal when absent)
    tapxy <x%> <y%>        tap at a position given in percent of the screen
    back                   the system Back gesture
    key <keycode>          an `input keyevent`
    text <string>          type into the focused field
    shell <command>        an `adb shell` command, output logged
    expect <regex>         fail the run unless a matching element shows
                           within 30 seconds

Usage: smoke.py <steps file> <output dir>
"""

import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

failures = []


def adb(*args, check=False, binary=False):
    result = subprocess.run(["adb", *args], capture_output=True, timeout=120)
    if check and result.returncode != 0:
        raise RuntimeError(result.stderr.decode(errors="replace"))
    return result.stdout if binary else result.stdout.decode(errors="replace")


def nodes():
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    xml = adb("shell", "cat", "/sdcard/ui.xml")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    found = []
    for node in root.iter("node"):
        label = (node.get("text") or "").strip() or (node.get("content-desc") or "").strip()
        match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds") or "")
        if not label or not match:
            continue
        x1, y1, x2, y2 = map(int, match.groups())
        found.append((label, (x1 + x2) // 2, (y1 + y2) // 2, node.get("class", "")))
    return found


def screen_size():
    match = re.search(r"(\d+)x(\d+)", adb("shell", "wm", "size"))
    return (int(match.group(1)), int(match.group(2))) if match else (1080, 2400)


def find(pattern):
    regex = re.compile(pattern, re.I)
    for label, x, y, _ in nodes():
        if regex.search(label):
            return label, x, y
    return None


def run(step, out):
    verb, _, arg = step.partition(" ")
    arg = arg.strip()
    if verb == "wait":
        time.sleep(float(arg))
    elif verb == "shot":
        (out / f"{arg}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
    elif verb == "dump":
        lines = [f"{x:5d},{y:5d}  {label[:90]}" for label, x, y, _ in nodes()]
        (out / f"{arg}.txt").write_text("\n".join(lines) + "\n")
        print(f"--- screen: {arg} ({len(lines)} elements)")
        print("\n".join(lines[:70]))
    elif verb == "tap":
        hit = find(arg)
        if hit:
            print(f"    tapping {hit[0]!r} at {hit[1]},{hit[2]}")
            adb("shell", "input", "tap", str(hit[1]), str(hit[2]))
        else:
            print(f"    !! nothing matches {arg!r}")
    elif verb == "tapxy":
        px, py = (float(v) for v in arg.split())
        width, height = screen_size()
        adb("shell", "input", "tap", str(int(width * px / 100)), str(int(height * py / 100)))
    elif verb == "back":
        adb("shell", "input", "keyevent", "4")
    elif verb == "key":
        adb("shell", "input", "keyevent", arg)
    elif verb == "text":
        adb("shell", "input", "text", arg.replace(" ", "%s"))
    elif verb == "shell":
        print(adb("shell", arg)[:6000])
    elif verb == "expect":
        deadline = time.time() + 30
        while time.time() < deadline:
            if find(arg):
                print(f"    ok: {arg!r} is on screen")
                return
            time.sleep(2)
        failures.append(arg)
        print(f"    !! EXPECTED {arg!r}, not on screen")
    else:
        print(f"    !! unknown step {step!r}")


def main():
    steps, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    for raw in steps.read_text().splitlines():
        step = raw.strip()
        if not step or step.startswith("#"):
            continue
        print(f">>> {step}", flush=True)
        try:
            run(step, out)
        except Exception as err:  # keep going: the later screens still tell something
            print(f"    !! {err}")
        time.sleep(1.2)
    if failures:
        sys.exit(f"smoke test: {len(failures)} expectation(s) not met: {failures}")


if __name__ == "__main__":
    main()
