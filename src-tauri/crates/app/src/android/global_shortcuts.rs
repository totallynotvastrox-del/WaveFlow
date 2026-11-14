//! Android stand-in for `global_shortcuts`.
//!
//! There is no system-wide key grab on Android. Headset and Bluetooth
//! media buttons reach the app through its media session instead (see
//! `media_controls`), so this module only answers "unavailable" in the
//! shape the Settings page already knows how to show.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GlobalAction {
    TogglePlayback,
    Next,
    Previous,
    ToggleLike,
    VolumeUp,
    VolumeDown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Backend {
    #[allow(dead_code)]
    Native,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum BindingState {
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BindingView {
    pub action: GlobalAction,
    pub combo: String,
    pub state: BindingState,
    pub trigger: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rejected {
    pub action: GlobalAction,
    pub combo: String,
    pub state: BindingState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub backend: Backend,
    pub bindings: Vec<BindingView>,
    pub rejected: Option<Rejected>,
}

pub fn initial_backend() -> Backend {
    Backend::Unavailable
}

pub struct GlobalShortcuts;

pub fn init(app: &AppHandle, _backend: Backend) {
    app.manage(GlobalShortcuts);
}

fn unavailable(rejected: Option<Rejected>) -> Snapshot {
    Snapshot {
        backend: Backend::Unavailable,
        bindings: Vec::new(),
        rejected,
    }
}

impl GlobalShortcuts {
    pub async fn snapshot(&self) -> Snapshot {
        unavailable(None)
    }

    pub async fn set(
        &self,
        _app: &AppHandle,
        _app_db: &SqlitePool,
        action: GlobalAction,
        combo: Option<&str>,
    ) -> AppResult<Snapshot> {
        let rejected = combo
            .map(str::trim)
            .filter(|c| !c.is_empty())
            .map(|c| Rejected {
                action,
                combo: c.to_string(),
                state: BindingState::Unavailable,
            });
        Ok(unavailable(rejected))
    }

    pub async fn suspend(&self, _app: &AppHandle, _suspended: bool) -> Snapshot {
        unavailable(None)
    }

    pub async fn clear(&self, _app: &AppHandle, _app_db: &SqlitePool) -> AppResult<Snapshot> {
        Ok(unavailable(None))
    }
}
