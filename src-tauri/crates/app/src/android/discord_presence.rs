//! Android stand-in for `discord_presence`.
//!
//! Rich Presence speaks to the desktop Discord client over a local IPC
//! pipe; the Android Discord app exposes nothing of the kind. The handle
//! is never created here, so every `try_state` lookup at the call sites
//! finds nothing and moves on.

use crate::audio::PlayerState;

pub struct DiscordPresenceHandle {
    _private: (),
}

#[allow(dead_code, clippy::too_many_arguments)]
impl DiscordPresenceHandle {
    pub fn set_enabled(&self, _enabled: bool) {}

    pub fn update_metadata(
        &self,
        _title: String,
        _artist: Option<String>,
        _album: Option<String>,
        _cover_url: Option<String>,
        _duration_ms: i64,
        _position_ms: u64,
    ) {
    }

    pub fn update_playback(&self, _state: PlayerState, _position_ms: u64) {}

    pub async fn is_live(&self) -> bool {
        false
    }

    pub async fn cover_url_for(
        &self,
        _pool: &sqlx::SqlitePool,
        _artwork_dir: &std::path::Path,
        _profile_id: i64,
        _track_id: i64,
    ) -> Option<String> {
        None
    }

    pub fn clear(&self) {}
}

pub fn init(_initial_enabled: bool) -> Option<DiscordPresenceHandle> {
    None
}

/// Always off: the toggle has nothing to drive on this platform.
pub async fn read_enabled(_app_db: &sqlx::SqlitePool) -> bool {
    false
}
