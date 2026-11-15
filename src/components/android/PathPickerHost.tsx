import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  CornerLeftUp,
  FileAudio,
  Folder,
  HardDrive,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useModalA11y } from "../../hooks/useModalA11y";
import {
  AnimatedModalContent,
  AnimatedModalShell,
} from "../common/AnimatedModalShell";
import { setPathPickerHost, type PathPickRequest } from "../../lib/pathPicker";
import {
  folderBrowserList,
  folderBrowserRoots,
  platformInfo,
  type BrowserEntry,
  type BrowserListing,
} from "../../lib/tauri/folderBrowser";
import { androidBridge } from "../../lib/platform";

/**
 * The folder, file and save picker of the Android build, drawn by the
 * app over its own listing of shared storage. Mounted once in
 * `AppLayout`; `lib/pathPicker.ts` hands it one request at a time.
 */
export function PathPickerHost() {
  const { t } = useTranslation();
  const [request, setRequest] = useState<PathPickRequest | null>(null);
  const [roots, setRoots] = useState<BrowserEntry[]>([]);
  const [listing, setListing] = useState<BrowserListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<boolean | null>(null);
  const [fileName, setFileName] = useState("");
  // A listing that answers after the user moved on is dropped.
  const visit = useRef(0);

  const finish = useCallback(
    (path: string | null) => {
      request?.resolve(path);
      setRequest(null);
      setListing(null);
      setError(null);
    },
    [request],
  );
  const cancel = useCallback(() => finish(null), [finish]);
  const dialogRef = useModalA11y<HTMLDivElement>(request != null, cancel);

  const browse = useCallback(async (path: string, extensions?: string[]) => {
    const mine = ++visit.current;
    setLoading(true);
    setError(null);
    try {
      const next = await folderBrowserList(path, extensions);
      if (mine !== visit.current) return;
      setListing(next);
    } catch (err) {
      if (mine !== visit.current) return;
      setError(String(err));
    } finally {
      if (mine === visit.current) setLoading(false);
    }
  }, []);

  const extensionsFor = (req: PathPickRequest): string[] | undefined =>
    req.mode === "file" ? (req.extensions ?? []) : undefined;

  const start = useCallback(
    async (req: PathPickRequest) => {
      setFileName(req.defaultName ?? "");
      try {
        const [info, volumes] = await Promise.all([
          platformInfo(),
          folderBrowserRoots(),
        ]);
        setAccess(info.storageAccess);
        setRoots(volumes);
        if (!info.storageAccess) return;
        const first = req.startDir ?? volumes[0]?.path;
        if (first) await browse(first, extensionsFor(req));
      } catch (err) {
        setError(String(err));
      }
    },
    [browse],
  );

  useEffect(() => {
    setPathPickerHost((next) => {
      setRequest(next);
      void start(next);
    });
    return () => setPathPickerHost(null);
  }, [start]);

  // Coming back from the system's permission screen: look again.
  useEffect(() => {
    if (request == null || access !== false) return;
    const recheck = () => {
      if (document.visibilityState === "visible") void start(request);
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [request, access, start]);

  if (request == null) {
    return <AnimatedModalShell isOpen={false}>{null}</AnimatedModalShell>;
  }

  const mode = request.mode;
  const title =
    request.title ??
    t(
      mode === "folder"
        ? "android.picker.titleFolder"
        : mode === "file"
          ? "android.picker.titleFile"
          : "android.picker.titleSave",
    );
  const go = (path: string) => void browse(path, extensionsFor(request));

  const saveTarget = (): string | null => {
    if (!listing) return null;
    let name = fileName.trim().replace(/[/\\]/g, "_");
    if (!name) return null;
    const ext = request.extensions?.[0];
    if (ext && !name.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
      name = `${name}.${ext}`;
    }
    return `${listing.path}/${name}`;
  };

  const rootLabel = roots.find((r) => r.path === listing?.path)?.name;
  const here = listing
    ? (rootLabel ??
      listing.path.split("/").filter(Boolean).pop() ??
      listing.path)
    : "";

  return (
    <AnimatedModalShell isOpen onBackdropClick={cancel}>
      <AnimatedModalContent
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="path-picker-title"
        className="android-sheet relative flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-zinc-900 shadow-2xl dark:border-zinc-800 dark:bg-surface-dark-elevated dark:text-zinc-100"
      >
        <div className="px-5 pb-3 pt-5">
          <h2 id="path-picker-title" className="text-lg font-semibold">
            {title}
          </h2>
          {listing && (
            <p
              className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400"
              dir="ltr"
            >
              {listing.path}
            </p>
          )}
        </div>

        {access === false ? (
          <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2 text-center">
            <ShieldAlert size={36} className="text-amber-500" />
            <p className="text-sm font-medium">{t("android.storage.title")}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("android.storage.body")}
            </p>
            <button
              type="button"
              onClick={() => androidBridge()?.requestStorageAccess?.()}
              className="mt-1 min-h-11 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white active:bg-emerald-600"
            >
              {t("android.storage.action")}
            </button>
          </div>
        ) : (
          <div className="min-h-40 flex-1 overflow-y-auto overscroll-contain border-y border-zinc-200 dark:border-zinc-800">
            {roots.length > 1 && (
              <div className="flex gap-2 overflow-x-auto px-4 py-2">
                {roots.map((root) => (
                  <button
                    key={root.path}
                    type="button"
                    onClick={() => go(root.path)}
                    className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 px-3 text-xs font-medium dark:border-zinc-700"
                  >
                    <HardDrive size={14} />
                    {root.name}
                  </button>
                ))}
              </div>
            )}
            {listing?.parent && (
              <button
                type="button"
                onClick={() => listing.parent && go(listing.parent)}
                className="flex min-h-12 w-full items-center gap-3 px-5 text-start text-sm text-zinc-500 active:bg-zinc-100 dark:text-zinc-400 dark:active:bg-zinc-800"
              >
                <CornerLeftUp size={18} className="shrink-0 rtl:-scale-x-100" />
                {t("android.picker.up")}
              </button>
            )}
            {loading && !listing && (
              <div className="flex justify-center py-8 text-zinc-400">
                <Loader2 size={22} className="animate-spin" />
              </div>
            )}
            {error && (
              <p className="px-5 py-4 text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
            {listing?.dirs.map((dir) => (
              <button
                key={dir.path}
                type="button"
                onClick={() => go(dir.path)}
                className="flex min-h-12 w-full items-center gap-3 px-5 text-start text-sm active:bg-zinc-100 dark:active:bg-zinc-800"
              >
                <Folder size={18} className="shrink-0 text-emerald-500" />
                <span className="min-w-0 flex-1 truncate">{dir.name}</span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-zinc-400 rtl:rotate-180"
                />
              </button>
            ))}
            {mode === "file" &&
              listing?.files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => finish(file.path)}
                  className="flex min-h-12 w-full items-center gap-3 px-5 text-start text-sm active:bg-zinc-100 dark:active:bg-zinc-800"
                >
                  <FileAudio size={18} className="shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                </button>
              ))}
            {listing &&
              !loading &&
              listing.dirs.length === 0 &&
              (mode !== "file" || listing.files.length === 0) && (
                <p className="px-5 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  {t("android.picker.empty")}
                </p>
              )}
          </div>
        )}

        <div className="flex flex-col gap-3 px-5 py-4">
          {mode === "folder" && listing && access !== false && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t("android.picker.audioCount", { count: listing.audioFiles })}
            </p>
          )}
          {mode === "save" && access !== false && (
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              aria-label={t("android.picker.fileName")}
              placeholder={t("android.picker.fileName")}
              className="min-h-11 w-full rounded-xl border border-zinc-200 bg-transparent px-3 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              className="min-h-11 rounded-full px-4 text-sm font-medium text-zinc-600 active:bg-zinc-100 dark:text-zinc-300 dark:active:bg-zinc-800"
            >
              {t("common.cancel")}
            </button>
            {mode === "folder" && (
              <button
                type="button"
                disabled={!listing || access === false}
                onClick={() => listing && finish(listing.path)}
                className="min-h-11 max-w-[70%] truncate rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white active:bg-emerald-600 disabled:opacity-40"
              >
                {t("android.picker.chooseFolder", { name: here })}
              </button>
            )}
            {mode === "save" && (
              <button
                type="button"
                disabled={saveTarget() == null || access === false}
                onClick={() => finish(saveTarget())}
                className="min-h-11 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white active:bg-emerald-600 disabled:opacity-40"
              >
                {t("common.save")}
              </button>
            )}
          </div>
        </div>
      </AnimatedModalContent>
    </AnimatedModalShell>
  );
}
