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

self.addEventListener("message", (event: MessageEvent<Request>) => {
    const { sources, themes, config, platform } = event.data;
    if (event.data.module !== undefined) {
        try {
            const exports = makeRequire(
                { "__root__/config.js": event.data.module },
                platform,
            )("./config.js");
            // JSON drops the functions a config may hold; structuredClone would throw.
            // eslint-disable-next-line unicorn/prefer-structured-clone
            self.postMessage({ config: JSON.parse(JSON.stringify(exports ?? {})), errors: [] });
        } catch (error) {
            self.postMessage({
                config: {},
                errors: [error instanceof Error ? error.message : String(error)],
            });
        }
        return;
    }
    const errors: string[] = [];
    let result = config;
    const requireTheme = makeRequire(sources, platform);
    for (const name of themes) {
        try {
            const loaded = requireTheme(name);
            const decorate = loaded?.decorateConfig ?? loaded?.default?.decorateConfig;
            if (typeof decorate !== "function") {
                errors.push(
                    `${name} has no decorateConfig, so it is not a theme Vanitty can load.`,
                );
                continue;
            }
            const next = decorate(structuredClone(result));
            // eslint-disable-next-line unicorn/prefer-structured-clone
            if (next && typeof next === "object") result = JSON.parse(JSON.stringify(next));
        } catch (error) {
            errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    self.postMessage({ config: result, errors });
});
