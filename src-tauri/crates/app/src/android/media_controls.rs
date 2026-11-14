//! Android stand-in for `media_controls`.
//!
//! On the desktop souvlaki owns the OS media overlay. On Android that
//! role belongs to a foreground service with a media session and its
//! notification (`PlaybackService.kt`), which is also what keeps the
//! process alive while the screen is off.
//!
//! The service is plain Kotlin and this side is plain Rust; they meet
//! over two JNI functions rather than a Tauri plugin, so the bridge works
//! with the activity in the background and its webview paused:
//!
//! - `nativeState()` — polled once a second by the service: what is
//!   playing, as one JSON object.
//! - `nativeAction(action, arg)` — a button on the notification, the lock
//!   screen, a headset or a Bluetooth remote. Routed through
//!   [`crate::player_actions`], like every other non-frontend control
//!   surface.

use std::sync::{Arc, Mutex, OnceLock};

use tauri::{AppHandle, Manager};

use crate::audio::{AudioEngine, PlayerState};
use crate::player_actions;

const LABEL: &str = "media session";

#[derive(Default, Clone)]
struct NowPlaying {
    title: String,
    artist: Option<String>,
    album: Option<String>,
    cover_path: Option<String>,
    duration_ms: i64,
    /// Bumped on every metadata change so the service reloads the cover
    /// only when the track really changed.
    revision: u64,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static NOW: Mutex<Option<NowPlaying>> = Mutex::new(None);

pub struct MediaControlsHandle {
    _private: (),
}

impl MediaControlsHandle {
    pub fn update_metadata(
        &self,
        title: String,
        artist: Option<String>,
        album: Option<String>,
        cover_path: Option<String>,
        duration_ms: i64,
    ) {
        if let Ok(mut slot) = NOW.lock() {
            let revision = slot.as_ref().map_or(0, |n| n.revision) + 1;
            *slot = Some(NowPlaying {
                title,
                artist,
                album,
                cover_path,
                duration_ms,
                revision,
            });
        }
    }

    /// Nothing to push: the service reads the engine's own state and
    /// position on its next poll.
    pub fn update_playback(&self, _state: PlayerState, _position_ms: u64) {}
}

pub fn init(app: AppHandle) -> Option<MediaControlsHandle> {
    let _ = APP.set(app);
    Some(MediaControlsHandle { _private: () })
}

fn state_json() -> String {
    let Some(app) = APP.get() else {
        return "{}".to_string();
    };
    let (state, position_ms) = match app.try_state::<Arc<AudioEngine>>() {
        Some(engine) => {
            let shared = engine.shared();
            (shared.state(), shared.current_position_ms())
        }
        None => (PlayerState::Idle, 0),
    };
    let now = NOW.lock().ok().and_then(|slot| slot.clone());
    let state = match state {
        PlayerState::Playing => "playing",
        PlayerState::Paused => "paused",
        PlayerState::Loading => "loading",
        PlayerState::Idle | PlayerState::Ended => "idle",
    };
    let now = now.unwrap_or_default();
    serde_json::json!({
        "state": state,
        "positionMs": position_ms,
        "durationMs": now.duration_ms,
        "title": now.title,
        "artist": now.artist,
        "album": now.album,
        "coverPath": now.cover_path,
        "revision": now.revision,
    })
    .to_string()
}

fn run_action(action: i32, arg: i64) {
    let Some(app) = APP.get() else {
        return;
    };
    match action {
        0 => player_actions::toggle_play_pause(app, LABEL),
        1 => player_actions::play(app, LABEL),
        2 => player_actions::pause(app),
        3 => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                player_actions::next(&app, LABEL).await;
            });
        }
        4 => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                player_actions::previous(&app, LABEL).await;
            });
        }
        5 => {
            if let Some(engine) = app.try_state::<Arc<AudioEngine>>() {
                let _ = engine.seek(arg.max(0) as u64);
            }
        }
        6 => player_actions::stop(app),
        _ => {}
    }
}

/// `app.waveflow.unofficial.PlaybackBridge.nativeState(): String`
#[no_mangle]
pub extern "system" fn Java_app_waveflow_unofficial_PlaybackBridge_nativeState<'local>(
    env: jni::JNIEnv<'local>,
    _class: jni::objects::JClass<'local>,
) -> jni::sys::jstring {
    // A panic must not unwind into the JVM.
    let json = std::panic::catch_unwind(state_json).unwrap_or_else(|_| "{}".to_string());
    match env.new_string(json) {
        Ok(s) => s.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// `app.waveflow.unofficial.PlaybackBridge.nativeAction(action: Int, arg: Long)`
#[no_mangle]
pub extern "system" fn Java_app_waveflow_unofficial_PlaybackBridge_nativeAction<'local>(
    _env: jni::JNIEnv<'local>,
    _class: jni::objects::JClass<'local>,
    action: jni::sys::jint,
    arg: jni::sys::jlong,
) {
    let _ = std::panic::catch_unwind(|| run_action(action, arg));
}
