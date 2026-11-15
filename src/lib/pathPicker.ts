/**
 * The in-app path picker's request channel.
 *
 * Android's system picker answers with `content://` documents, which the
 * scanner, the decoder and the tag writer cannot open: they work on
 * paths. So on Android a folder, a file or a save target is picked in a
 * sheet the app draws over its own listing of shared storage
 * (`PathPickerHost`), and the callers keep receiving a plain path, as
 * they do from the desktop dialogs.
 */
export type PathPickMode = "folder" | "file" | "save";

export interface PathPickOptions {
  mode: PathPickMode;
  title?: string;
  /** File mode: extensions to list. Save mode: the first is appended. */
  extensions?: string[];
  /** Save mode: the suggested file name. */
  defaultName?: string;
  /** Where to open, when it is a readable directory. */
  startDir?: string;
}

export interface PathPickRequest extends PathPickOptions {
  resolve: (path: string | null) => void;
}

type Host = (request: PathPickRequest) => void;

let host: Host | null = null;

/** Registered by `PathPickerHost` while it is mounted. */
export function setPathPickerHost(next: Host | null): void {
  host = next;
}

export function requestPath(options: PathPickOptions): Promise<string | null> {
  return new Promise((resolve) => {
    if (!host) {
      resolve(null);
      return;
    }
    host({ ...options, resolve });
  });
}
