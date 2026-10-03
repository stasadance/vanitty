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

type Module = { exports: any };

function dirname(p: string) {
    const i = p.lastIndexOf("/");
    return i < 0 ? "" : p.slice(0, i);
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
        [p, `${p}.js`, `${p}.json`, `${p}.cjs`, `${p}/index.js`, `${p}/index.json`].find(
            (c) => c in sources,
        );

    const resolvePackage = (dir: string): string | undefined => {
        const pkg = sources[`${dir}/package.json`];
        if (pkg) {
            try {
                const main = JSON.parse(pkg).main;
                if (main) {
                    const found = tryFile(join(dir, main));
                    if (found) return found;
                }
            } catch {
                // Broken package.json, fall through to index.js.
            }
        }
        return tryFile(dir);
    };

    const resolve = (spec: string, from: string): string => {
        let found: string | undefined;
        if (spec.startsWith(".") || spec.startsWith("/")) {
            const p = join(dirname(from), spec);
            found = tryFile(p) ?? resolvePackage(p);
        } else {
            const parts = spec.split("/");
            const pkgName = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
            const rest = spec.slice(pkgName.length);
            // Nested node_modules first, then the flat top level.
            let dir = dirname(from);
            while (dir && !found) {
                const base = join(dir, "node_modules", pkgName);
                found = rest ? tryFile(base + rest) : resolvePackage(base);
                dir = dirname(dir);
            }
            found ??= rest ? tryFile(pkgName + rest) : resolvePackage(pkgName);
        }
        if (!found) throw new Error(`Cannot find module '${spec}' from '${from}'`);
        return found;
    };

    const load = (path: string): any => {
        const cached = cache.get(path);
        if (cached) return cached.exports;
        const module: Module = { exports: {} };
        cache.set(path, module);
        const src = sources[path];
        if (path.endsWith(".json")) {
            module.exports = JSON.parse(src);
            return module.exports;
        }
        const process = {
            platform: platformToNode(platform),
            env: {},
            versions: {},
            cwd: () => "/",
        };
        const fn = new Function(
            "module",
            "exports",
            "require",
            "__filename",
            "__dirname",
            "process",
            src,
        );
        fn(
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
        if (bare in builtins) return builtins[bare];
        return load(resolve(spec, from));
    };

    return (name: string) => load(resolve(name, "__root__/x.js"));
}

export function platformToNode(p: string) {
    return p === "macos" ? "darwin" : p === "windows" ? "win32" : p;
}
