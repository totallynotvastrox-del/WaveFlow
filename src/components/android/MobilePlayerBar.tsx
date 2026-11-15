import { useTranslation } from "react-i18next";
import {
  ListMusic,
  Loader2,
  Pause,
  Play,
  Radio,
  SkipForward,
} from "lucide-react";
import { usePlayer } from "../../hooks/usePlayer";
import { usePlayerPositionValue } from "../../hooks/usePlayerPosition";
import { Artwork } from "../common/Artwork";
import { isRadioTrack } from "../../lib/playerSources";

/**
 * The phone layout's player bar: what is playing and the two controls a
 * thumb reaches for. Everything else the desktop bar carries (seek,
 * shuffle, repeat, lyrics, the overflow menu) is one tap away in the
 * full-screen player this bar opens.
 */
export function MobilePlayerBar() {
  const { t } = useTranslation();
  const {
    currentTrack,
    isPlaying,
    playbackState,
    togglePlayback,
    next,
    toggleQueue,
    isQueueOpen,
    openFullscreenNowPlaying,
  } = usePlayer();

  const duration = currentTrack?.duration_ms ?? 0;
  const progress = usePlayerPositionValue((ms) =>
    duration > 0 ? Math.min(1000, Math.round((ms / duration) * 1000)) : 0,
  );

  const title = currentTrack?.title ?? t("player.noTrack");
  const subtitle =
    currentTrack?.artist_name ??
    currentTrack?.album_title ??
    t("player.inactive");
  const loading = playbackState === "loading";
  const idle = !currentTrack && playbackState === "idle";
  const button =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-zinc-700 active:bg-zinc-100 disabled:opacity-40 dark:text-zinc-100 dark:active:bg-zinc-800";

  return (
    <footer className="mobile-player-bar z-50 shrink-0 border-t border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-surface-dark-elevated dark:text-zinc-400">
      <div
        className="h-0.5 w-full bg-zinc-200 dark:bg-zinc-800"
        dir="ltr"
        aria-hidden
      >
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${progress / 10}%` }}
        />
      </div>
      <div className="flex h-16 items-center gap-1 ps-3 pe-1">
        <button
          type="button"
          onClick={() => currentTrack && openFullscreenNowPlaying()}
          disabled={!currentTrack}
          aria-label={t("playerBar.openFullscreen")}
          className="flex min-w-0 flex-1 items-center gap-3 text-start disabled:cursor-default"
        >
          <Artwork
            path={currentTrack?.artwork_path ?? null}
            path1x={currentTrack?.artwork_path_1x ?? null}
            path2x={currentTrack?.artwork_path_2x ?? null}
            size="1x"
            className="h-11 w-11 shrink-0 shadow-sm"
            iconSize={20}
            alt={title}
            rounded="lg"
            placeholderIcon={isRadioTrack(currentTrack) ? Radio : undefined}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {title}
            </span>
            <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {subtitle}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={toggleQueue}
          aria-label={t("playerBar.queue")}
          aria-pressed={isQueueOpen}
          className={`${button} ${isQueueOpen ? "!text-emerald-500" : ""}`}
        >
          <ListMusic size={22} />
        </button>
        <button
          type="button"
          onClick={() => void togglePlayback()}
          disabled={idle}
          aria-label={t(
            isPlaying ? "player.controls.pause" : "player.controls.play",
          )}
          className={button}
        >
          {loading ? (
            <Loader2 size={24} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={24} className="fill-current" />
          ) : (
            <Play size={24} className="fill-current" />
          )}
        </button>
        <button
          type="button"
          onClick={() => void next()}
          disabled={idle}
          aria-label={t("player.controls.next")}
          className={button}
        >
          <SkipForward size={22} className="fill-current" />
        </button>
      </div>
    </footer>
  );
}
