/// <reference lib="webworker" />
// Shared by the theme and plugin workers: no network, and a CommonJS
// `require` that only sees the package sources handed to the worker.

/** Removes network and storage APIs from the worker before untrusted code runs. */
export function lockdown() {
    for (const name of [
        "fetch",
        "XMLHttpRequest",
        "WebSocket",
        "EventSource",
        "importScripts",
        "indexedDB",
        "caches",
        "Worker",
        "SharedWorker",
        "WebTransport",
        "BroadcastChannel",
    ]) {
        try {
            Object.defineProperty(self, name, { value: undefined, configurable: false });
        } catch {
            // Not present in this engine.
        }
    }
}

// A CommonJS module can export anything.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Module = { exports: any };

function dirname(p: string) {
    const index = p.lastIndexOf("/");
    return index === -1 ? "" : p.slice(0, index);
}

function join(...parts: string[]) {
    const out: string[] = [];
    for (const seg of parts.join("/").split("/")) {
        if (!seg || seg === ".") continue;
        if (seg === "..") out.pop();
        else out.push(seg);
    }
    return out.join("/");
}

export function makeRequire(sources: Record<string, string>, platform: string) {
    const cache = new Map<string, Module>();
    const builtins: Record<string, unknown> = {
        path: {
            join,
            resolve: join,
            dirname,
            basename: (p: string) => p.split("/").pop(),
            sep: "/",
        },
        os: { platform: () => platform, homedir: () => "", EOL: "\n" },
        fs: { existsSync: () => false, readFileSync: () => "" },
        util: { inspect: String },
    };

    const tryFile = (p: string) =>
        [p, `${p}.js`, `${p}.json`, `${p}.cjs`, `${p}/index.js`, `${p}/index.json`].find((c) =>
            Object.hasOwn(sources, c),
        );

    const resolvePackage = (directory: string): string | undefined => {
        const packageJson = sources[`${directory}/package.json`];
        if (packageJson) {
            try {
                const main = JSON.parse(packageJson).main;
                if (main) {
                    const found = tryFile(join(directory, main));
                    if (found) return found;
                }
            } catch {
                // Broken package.json, fall through to index.js.
            }
        }
        return tryFile(directory);
    };

    const resolve = (spec: string, from: string): string => {
        let found: string | undefined;
        if (spec.startsWith(".") || spec.startsWith("/")) {
            const p = join(dirname(from), spec);
            found = tryFile(p) ?? resolvePackage(p);
        } else {
            const parts = spec.split("/");
            const packageName = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
            const rest = spec.slice(packageName.length);
            // Nested node_modules first, then the flat top level.
            let directory = dirname(from);
            while (directory && !found) {
                const base = join(directory, "node_modules", packageName);
                found = rest ? tryFile(base + rest) : resolvePackage(base);
                directory = dirname(directory);
            }
            found ??= rest ? tryFile(packageName + rest) : resolvePackage(packageName);
        }
        if (!found) throw new Error(`Cannot find module '${spec}' from '${from}'`);
        return found;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (path: string): any => {
        const cached = cache.get(path);
        if (cached) return cached.exports;
        const module: Module = { exports: {} };
        cache.set(path, module);
        const source = sources[path];
        if (path.endsWith(".json")) {
            module.exports = JSON.parse(source);
            return module.exports;
        }
        const process = {
            platform: platformToNode(platform),
            env: {},
            versions: {},
            cwd: () => "/",
        };
        const wrapper = new Function(
            "module",
            "exports",
            "require",
            "__filename",
            "__dirname",
            "process",
            source,
        );
        wrapper(
            module,
            module.exports,
            (spec: string) => requireFrom(spec, path),
            path,
            dirname(path),
            process,
        );
        return module.exports;
    };

    const requireFrom = (spec: string, from: string) => {
        const bare = spec.replace(/^node:/, "");
        return Object.hasOwn(builtins, bare) ? builtins[bare] : load(resolve(spec, from));
    };

    return (name: string) => load(resolve(name, "__root__/x.js"));
}

export function platformToNode(p: string) {
    if (p === "macos") return "darwin";
    return p === "windows" ? "win32" : p;
}
