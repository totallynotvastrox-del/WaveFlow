//! Android stand-in for `trash`.
//!
//! Android has no trash a file path can be sent to (MediaStore's is per
//! media item and needs a user prompt for every file the app did not
//! create). A duplicate set aside is therefore moved, not deleted, into
//! a `WaveFlow Trash` folder at the top of the same storage volume, where
//! any file manager can restore or empty it. A rename keeps it instant
//! and never crosses volumes.

use std::path::{Path, PathBuf};

pub type Outcome = Result<(), String>;

const TRASH_FOLDER: &str = "WaveFlow Trash";

pub async fn on_trash_thread<R: Send + 'static>(
    work: impl FnOnce() -> R + Send + 'static,
) -> Result<R, String> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(|_| "the trash thread stopped".to_string())
}

/// The top of the storage volume `path` is on: `/storage/emulated/0`
/// for shared storage, `/storage/<volume-id>` for a card or a drive.
fn volume_root(path: &Path) -> Option<PathBuf> {
    let mut parts = path.components();
    let mut root = PathBuf::new();
    for _ in 0..3 {
        root.push(parts.next()?);
    }
    // `/storage/emulated/<user>` is one level deeper than a card.
    if root.ends_with("emulated") {
        root.push(parts.next()?);
    }
    root.starts_with("/storage").then_some(root)
}

pub fn move_one(path: &Path) -> Outcome {
    let root = volume_root(path).ok_or_else(|| {
        "this file is not on shared storage, so it cannot be set aside".to_string()
    })?;
    let dir = root.join(TRASH_FOLDER);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    // Keeps a scanner that walks the whole volume out of the folder.
    let _ = std::fs::File::create(dir.join(".nomedia"));
    let name = path
        .file_name()
        .ok_or_else(|| "the path names no file".to_string())?;
    let mut target = dir.join(name);
    let mut n = 1;
    while target.exists() {
        let stem = Path::new(name)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = Path::new(name)
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        target = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    std::fs::rename(path, &target).map_err(|e| format!("move to {}: {e}", target.display()))
}
