// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // NVIDIA's explicit sync makes WebKitGTK crash on Wayland with "Error 71
    // (Protocol error) dispatching to Wayland display". Turning it off keeps
    // GPU rendering, unlike WEBKIT_DISABLE_DMABUF_RENDERER which is very slow.
    // Respect an explicit value so users can opt back in.
    #[cfg(target_os = "linux")]
    if std::path::Path::new("/proc/driver/nvidia/version").exists()
        && std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none()
    {
        // SAFETY: runs first in main, before any other threads exist.
        unsafe { std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1") };
    }

    vanitty_lib::run()
}
