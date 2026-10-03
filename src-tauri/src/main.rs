// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMA-BUF renderer crashes on many Wayland setups (notably
    // NVIDIA) with "Error 71 (Protocol error) dispatching to Wayland display".
    // Respect an explicit value so users can opt back in.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: runs first in main, before any other threads exist.
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }

    vanitty_lib::run()
}
