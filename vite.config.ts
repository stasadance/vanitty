import process from "node:process";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error type error without @types/node package
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
    plugins: [react(), babel({ presets: [reactCompilerPreset()] })],

    // Keep Rust errors visible.
    clearScreen: false,
    // In src-tauri so the crate embeds it. xterm is one big chunk, loaded from disk.
    build: { outDir: "src-tauri/dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
    // Tauri expects this exact port.
    server: {
        port: 1420,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: 1421,
              }
            : undefined,
        watch: {
            ignored: ["**/src-tauri/**"],
        },
    },
}));
