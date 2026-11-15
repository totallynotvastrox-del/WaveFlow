import { invoke } from "@tauri-apps/api/core";

/** Mirrors `commands::folder_browser::BrowserEntry`. */
export interface BrowserEntry {
  name: string;
  path: string;
}

/** Mirrors `commands::folder_browser::BrowserListing`. */
export interface BrowserListing {
  path: string;
  parent: string | null;
  dirs: BrowserEntry[];
  files: BrowserEntry[];
  audioFiles: number;
}

/** Mirrors `commands::folder_browser::PlatformInfo`. */
export interface PlatformInfo {
  os: string;
  storageAccess: boolean;
}

export function folderBrowserRoots(): Promise<BrowserEntry[]> {
  return invoke<BrowserEntry[]>("folder_browser_roots");
}

/**
 * The folders inside `path`. Pass `extensions` to also get the files
 * carrying one of them (an empty list means every file).
 */
export function folderBrowserList(
  path: string,
  extensions?: string[],
): Promise<BrowserListing> {
  return invoke<BrowserListing>("folder_browser_list", {
    path,
    extensions: extensions ?? null,
  });
}

export function platformInfo(): Promise<PlatformInfo> {
  return invoke<PlatformInfo>("platform_info");
}
