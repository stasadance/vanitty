/// <reference lib="webworker" />
import { lockdown, makeRequire } from "../sandbox/require";

lockdown();

// Evaluates Hyper theme packages. Runs in a worker so theme code has no
// access to the DOM, the Tauri IPC bridge or the network.

interface Request {
    sources: Record<string, string>;
    themes: string[];
    config: Record<string, unknown>;
    platform: string;
    /** Evaluate this CommonJS source and return its exports (for .hyper.js). */
    module?: string;
}

self.onmessage = (e: MessageEvent<Request>) => {
    const { sources, themes, config, platform } = e.data;
    if (e.data.module !== undefined) {
        try {
            const exports = makeRequire(
                { "__root__/config.js": e.data.module },
                platform,
            )("./config.js");
            self.postMessage({ config: JSON.parse(JSON.stringify(exports ?? {})), errors: [] });
        } catch (err) {
            self.postMessage({
                config: {},
                errors: [err instanceof Error ? err.message : String(err)],
            });
        }
        return;
    }
    const errors: string[] = [];
    let result = config;
    const requireTheme = makeRequire(sources, platform);
    for (const name of themes) {
        try {
            const mod = requireTheme(name);
            const decorate = mod?.decorateConfig ?? mod?.default?.decorateConfig;
            if (typeof decorate !== "function") {
                errors.push(
                    `${name} has no decorateConfig, so it is not a theme Vanitty can load.`,
                );
                continue;
            }
            const next = decorate(structuredClone(result));
            if (next && typeof next === "object") result = JSON.parse(JSON.stringify(next));
        } catch (err) {
            errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    self.postMessage({ config: result, errors });
};
