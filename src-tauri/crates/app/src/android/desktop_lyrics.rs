//! Android stand-in for `desktop_lyrics`.
//!
//! The desktop overlay is a second, transparent, always-on-top window.
//! An Android activity has one window, so the overlay does not exist
//! here: the in-app lyrics view (full screen on a phone, docked on a
//! tablet) takes its place. The commands stay registered and report a
//! closed overlay, which is what the interface hides its button on.

use serde::Serialize;
use tauri::AppHandle;

pub const LABEL: &str = "lyrics";

#[derive(Default)]
pub struct DesktopLyricsState;

#[derive(Debug, Clone, Copy, Serialize)]
pub struct DesktopLyricsStatus {
    pub open: bool,
    pub locked: bool,
    pub wayland: bool,
}

const CLOSED: DesktopLyricsStatus = DesktopLyricsStatus {
    open: false,
    locked: false,
    wayland: false,
};

pub fn status(_app: &AppHandle) -> DesktopLyricsStatus {
    CLOSED
}

pub async fn open(_app: &AppHandle) -> tauri::Result<()> {
    Ok(())
}

pub async fn close(_app: &AppHandle) -> tauri::Result<()> {
    Ok(())
}

pub fn mark_closing(_app: &AppHandle) {}

pub fn set_locked(_app: &AppHandle, _locked: bool) -> tauri::Result<()> {
    Ok(())
}

pub fn on_destroyed(_app: &AppHandle) {}
