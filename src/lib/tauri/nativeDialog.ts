/**
 * `open` and `save` with the dialog plugin's signatures, answered by the
 * system dialog on the desktop and by the in-app picker on Android (see
 * `lib/pathPicker.ts` for why). Import these instead of the plugin's.
 */
import {
  open as pluginOpen,
  save as pluginSave,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "@tauri-apps/plugin-dialog";
import { IS_ANDROID } from "../platform";
import { requestPath } from "../pathPicker";

function extensionsOf(
  filters: OpenDialogOptions["filters"] | SaveDialogOptions["filters"],
): string[] {
  return (filters ?? []).flatMap((f) => f.extensions).filter((e) => e !== "*");
}

function splitPath(path: string | undefined): {
  dir: string | undefined;
  name: string | undefined;
} {
  if (!path) return { dir: undefined, name: undefined };
  const cut = path.lastIndexOf("/");
  if (cut < 0) return { dir: undefined, name: path };
  return { dir: path.slice(0, cut) || undefined, name: path.slice(cut + 1) };
}

export async function open(
  options: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  if (!IS_ANDROID) {
    return (await pluginOpen(options)) as string | string[] | null;
  }
  const picked = await requestPath({
    mode: options.directory ? "folder" : "file",
    title: options.title,
    extensions: extensionsOf(options.filters),
    startDir: options.defaultPath,
  });
  if (picked == null) return null;
  return options.multiple ? [picked] : picked;
}

export async function save(
  options: SaveDialogOptions = {},
): Promise<string | null> {
  if (!IS_ANDROID) return pluginSave(options);
  const { dir, name } = splitPath(options.defaultPath);
  return requestPath({
    mode: "save",
    title: options.title,
    extensions: extensionsOf(options.filters),
    defaultName: name,
    startDir: dir,
  });
}
