fn main() {
    // WebKitGTK must bind to our drmWaitVBlank (src/vblank.rs), so the binary
    // keeps and exports it.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        println!("cargo:rustc-link-arg-bins=-Wl,--undefined=drmWaitVBlank");
        println!("cargo:rustc-link-arg-bins=-Wl,--export-dynamic-symbol=drmWaitVBlank");
    }
    tauri_build::build()
}
