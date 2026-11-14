//! A folder browser the interface draws itself.
//!
//! The desktop picks a library folder through the system's dialog. On
//! Android that dialog hands back a `content://` document tree, which
//! neither the scanner nor the decoder can open: both read paths. With
//! "All files access" granted the shared storage is an ordinary
//! directory tree, so the app lists it itself and the scanner keeps
//! working on real paths.
//!
//! Nothing here is Android-specific code: the commands list directories
//! and work anywhere. Only the interface decides when to use them.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserEntry {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserListing {
    pub path: String,
    pub parent: Option<String>,
    pub dirs: Vec<BrowserEntry>,
    /// Audio files directly inside, so the user can tell a music folder
    /// from an empty one before picking it.
    pub audio_files: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    /// `android`, `linux`, `macos` or `windows`.
    pub os: &'static str,
    /// Whether shared storage can be read: on Android, whether "All files
    /// access" was granted. Always true elsewhere.
    pub storage_access: bool,
}

const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "aiff", "aif", "ogg", "oga", "opus", "m4a", "m4b", "mp4", "aac", "alac",
    "wv", "ape", "dsf", "dff", "wma",
];

fn roots() -> Vec<PathBuf> {
    #[cfg(target_os = "android")]
    {
        crate::android::storage_roots()
    }
    #[cfg(not(target_os = "android"))]
    {
        dirs::home_dir().into_iter().collect()
    }
}

fn label_for_root(path: &Path) -> String {
    #[cfg(target_os = "android")]
    if path == Path::new(crate::android::SHARED_STORAGE) {
        return "Internal storage".to_string();
    }
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}

/// Where browsing starts: the device's storage volumes.
#[tauri::command]
pub fn folder_browser_roots() -> Vec<BrowserEntry> {
    roots()
        .into_iter()
        .map(|path| BrowserEntry {
            name: label_for_root(&path),
            path: path.to_string_lossy().into_owned(),
        })
        .collect()
}

/// The folders directly inside `path`, hidden ones left out.
#[tauri::command]
pub async fn folder_browser_list(path: String) -> AppResult<BrowserListing> {
    tokio::task::spawn_blocking(move || list(Path::new(&path)))
        .await
        .map_err(|err| AppError::Other(format!("folder listing stopped: {err}")))?
}

fn list(path: &Path) -> AppResult<BrowserListing> {
    let entries = std::fs::read_dir(path)
        .map_err(|err| AppError::Other(format!("{}: {err}", path.display())))?;
    let mut dirs = Vec::new();
    let mut audio_files = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let entry_path = entry.path();
        let is_dir = kind.is_dir() || (kind.is_symlink() && entry_path.is_dir());
        if is_dir {
            // `Android/` holds other apps' private data and is not readable.
            if name == "Android" && path.parent().is_some_and(|p| p.ends_with("emulated")) {
                continue;
            }
            dirs.push(BrowserEntry {
                name,
                path: entry_path.to_string_lossy().into_owned(),
            });
        } else if entry_path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        {
            audio_files += 1;
        }
    }
    dirs.sort_by_key(|d| d.name.to_lowercase());
    let is_root = roots().iter().any(|root| root == path);
    let parent = if is_root {
        None
    } else {
        path.parent().map(|p| p.to_string_lossy().into_owned())
    };
    Ok(BrowserListing {
        path: path.to_string_lossy().into_owned(),
        parent,
        dirs,
        audio_files,
    })
}

/// What the interface needs to know about where it runs.
#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    #[cfg(target_os = "android")]
    {
        PlatformInfo {
            os: "android",
            storage_access: std::fs::read_dir(crate::android::SHARED_STORAGE).is_ok(),
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        PlatformInfo {
            os: std::env::consts::OS,
            storage_access: true,
        }
    }
}
