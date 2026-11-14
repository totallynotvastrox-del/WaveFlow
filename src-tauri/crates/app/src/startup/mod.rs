//! What `run` hands to the builder, kept out of the assembly itself: the
//! pre-flights that run before the builder exists, the `setup` hook, the
//! tray, and the window and run-event handlers.

mod events;
mod fatal;
mod preflight;
mod resume_point;
mod setup;
#[cfg(not(target_os = "android"))]
mod tray;
mod window;

#[cfg(not(target_os = "android"))]
pub(crate) use events::on_second_instance;
pub(crate) use events::{on_run_event, on_window_event};
#[cfg(target_os = "linux")]
pub(crate) use preflight::{preflight_appimage_gstreamer, preflight_file_dialogs};
pub(crate) use preflight::{preflight_render_mode, preflight_schema_guard};
pub(crate) use setup::setup;
