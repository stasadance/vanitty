mod config;
mod packages;
mod pty;
mod session;
mod updater;
mod window;

use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(window::state_plugin())
        .manage(pty::PtyManager::default())
        .manage(session::SessionStore::load())
        .manage(updater::Updater::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_cwd,
            pty::pty_default_shell,
            config::config_info,
            config::config_read,
            config::config_write,
            config::config_open,
            config::hyper_config_find,
            packages::packages_install,
            packages::packages_sources,
            updater::update_check,
            updater::update_install,
            window::window_new,
            session::session_take,
            session::session_save,
            session::session_clear,
            session::session_quitting,
        ])
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                webview
                    .state::<pty::PtyManager>()
                    .kill_window(webview.label());
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                window
                    .state::<pty::PtyManager>()
                    .kill_window(window.label());
                session::SessionStore::window_closed(window.app_handle(), window.label());
            }
        })
        .setup(|app| {
            config::watch(app.handle());
            window::create(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            handle.state::<pty::PtyManager>().kill_all();
            updater::install_on_exit(handle);
        }
    });
}
