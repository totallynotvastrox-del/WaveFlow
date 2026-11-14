//! What the Android build needs that no desktop build does.
//!
//! The desktop-only subsystems (tray, global shortcuts, the OS trash,
//! Discord's IPC pipe, the floating lyrics window, souvlaki) have no
//! Android backend. Their modules are swapped for the stand-ins in this
//! directory through `#[cfg_attr(target_os = "android", path = …)]` in
//! `lib.rs`, each one keeping the public surface the rest of the crate
//! calls so no call site has to know which platform it is on.

use std::path::{Path, PathBuf};

/// The shared storage every Android device mounts for its first user:
/// where `Music`, `Download` and `Documents` live.
pub const SHARED_STORAGE: &str = "/storage/emulated/0";

/// The package this process runs as. Android names an app's process
/// after its package, so `/proc/self/cmdline` answers before any Java
/// context exists, which is when the pre-flights need it.
pub fn package_name() -> Option<String> {
    let raw = std::fs::read("/proc/self/cmdline").ok()?;
    let name = raw.split(|b| *b == 0).next()?;
    let name = String::from_utf8_lossy(name).trim().to_string();
    // A process started with `android:process=":x"` carries the suffix.
    let name = name.split(':').next().unwrap_or_default().to_string();
    (!name.is_empty()).then_some(name)
}

/// The app's private data directory (`Context.getDataDir()`).
pub fn private_dir() -> Option<PathBuf> {
    package_name().map(|pkg| PathBuf::from("/data/data").join(pkg))
}

/// Give the process the two variables a desktop takes for granted.
/// `HOME` is what `dirs` resolves everything from, and `TMPDIR` because
/// the platform default (`/data/local/tmp`) is not writable by an app.
/// Called first thing in `run`, before any thread exists.
pub fn prepare_process_env() {
    let Some(dir) = private_dir() else {
        return;
    };
    if std::env::var_os("HOME").is_none() {
        std::env::set_var("HOME", &dir);
    }
    let tmp = dir.join("cache");
    let _ = std::fs::create_dir_all(&tmp);
    std::env::set_var("TMPDIR", &tmp);
}

/// Shared-storage folders a user is likely to keep music in, for the
/// in-app folder picker's shortcuts.
pub fn storage_roots() -> Vec<PathBuf> {
    let mut roots = vec![PathBuf::from(SHARED_STORAGE)];
    // Removable volumes (SD cards, USB drives) mount under `/storage`
    // by their volume id.
    if let Ok(entries) = std::fs::read_dir("/storage") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name == "emulated" || name == "self" {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                roots.push(path);
            }
        }
    }
    roots
}

/// Write the plugins a desktop bundle ships as resources under
/// `<root>/bundled-plugins`, and return that directory. Rewritten only
/// when the copy on disk differs, so an update replaces them and an
/// ordinary launch touches nothing.
pub fn unpack_bundled_plugins(root: &Path) -> Option<PathBuf> {
    const FILES: &[(&str, &[u8])] = &[
        (
            "web-radio/plugin.wasm",
            include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../resources/plugins/web-radio/plugin.wasm"
            )),
        ),
        (
            "web-radio/manifest.toml",
            include_bytes!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../resources/plugins/web-radio/manifest.toml"
            )),
        ),
    ];
    let dir = root.join("bundled-plugins");
    for (rel, bytes) in FILES {
        let target = dir.join(rel);
        if std::fs::read(&target).is_ok_and(|current| current == *bytes) {
            continue;
        }
        if let Some(parent) = target.parent() {
            if let Err(err) = std::fs::create_dir_all(parent) {
                tracing::warn!(%err, "bundled plugins: could not create {}", parent.display());
                return None;
            }
        }
        if let Err(err) = std::fs::write(&target, bytes) {
            tracing::warn!(%err, "bundled plugins: could not write {}", target.display());
            return None;
        }
    }
    Some(dir)
}
