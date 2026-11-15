/**
 * Where the interface runs, and which of its two touch layouts it draws.
 *
 * The desktop builds never leave `"desktop"`. The Android build picks
 * between a phone layout (bottom navigation, the sidebar as a drawer,
 * panels as full-screen sheets) and a tablet layout (the desktop
 * arrangement with docked panels, sized for touch). The choice is
 * automatic from the screen's shortest side and can be pinned from
 * Settings, because a large phone and a small tablet overlap and only
 * the person holding it knows which one they want.
 *
 * The result is stamped on `<html data-device>` so the stylesheet can
 * key on it, the same way the skins key on `data-layout`.
 */
import { useSyncExternalStore } from "react";

export type DeviceMode = "desktop" | "phone" | "tablet";
export type DeviceModePreference = "auto" | "phone" | "tablet";

/** Shortest screen side, in CSS pixels, from which a device is a tablet. */
const TABLET_MIN_SHORT_SIDE = 600;

const PREFERENCE_KEY = "waveflow.android.layout";

interface AndroidBridge {
  hasStorageAccess?: () => boolean;
  requestStorageAccess?: () => void;
  moveToBackground?: () => void;
  setChrome?: (color: string, lightBackground: boolean) => void;
  keepScreenOn?: (on: boolean) => void;
  sdkInt?: () => number;
}

declare global {
  interface Window {
    WaveFlowAndroid?: AndroidBridge;
    /** Called by the activity on the system Back gesture. */
    __waveflowBack?: () => boolean;
  }
}

function detectAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/Android/i.test(navigator.userAgent)) return true;
  // Lets the touch layouts be exercised in a desktop browser.
  try {
    return new URLSearchParams(window.location.search).get("android") === "1";
  } catch {
    return false;
  }
}

export const IS_ANDROID = detectAndroid();

/** The activity's JavaScript interface, when the page runs inside it. */
export function androidBridge(): AndroidBridge | null {
  return typeof window !== "undefined"
    ? (window.WaveFlowAndroid ?? null)
    : null;
}

export function getDeviceModePreference(): DeviceModePreference {
  try {
    const stored = localStorage.getItem(PREFERENCE_KEY);
    if (stored === "phone" || stored === "tablet") return stored;
  } catch {
    // Storage unavailable: automatic.
  }
  return "auto";
}

function resolve(): DeviceMode {
  if (!IS_ANDROID) return "desktop";
  const preference = getDeviceModePreference();
  if (preference !== "auto") return preference;
  const shortSide = Math.min(window.innerWidth, window.innerHeight);
  return shortSide >= TABLET_MIN_SHORT_SIDE ? "tablet" : "phone";
}

let current: DeviceMode = "desktop";
const listeners = new Set<() => void>();

function apply(): void {
  const next = resolve();
  document.documentElement.dataset.device = next;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function setDeviceModePreference(
  preference: DeviceModePreference,
): void {
  try {
    if (preference === "auto") localStorage.removeItem(PREFERENCE_KEY);
    else localStorage.setItem(PREFERENCE_KEY, preference);
  } catch {
    // Not persisted; still applied for this session below.
  }
  apply();
  for (const listener of listeners) listener();
}

/** Stamp the mode before first paint and follow rotations and resizes. */
export function initPlatform(): void {
  if (typeof window === "undefined") return;
  current = resolve();
  document.documentElement.dataset.device = current;
  if (!IS_ANDROID) return;
  window.addEventListener("resize", apply);
}

export function getDeviceMode(): DeviceMode {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDeviceMode(): DeviceMode {
  return useSyncExternalStore(subscribe, getDeviceMode);
}

export function useDeviceModePreference(): DeviceModePreference {
  return useSyncExternalStore(subscribe, getDeviceModePreference);
}
