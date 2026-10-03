/// <reference lib="webworker" />
import { lockdown, makeRequire } from "../sandbox/require";
import type { Disposable, VanittyAPI, VanittyPlugin } from "./api";
import type { HostToWorker, WorkerToHost } from "./protocol";

lockdown();

const post = (m: WorkerToHost) => self.postMessage(m);

let nextCall = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const call = <T>(method: string, ...args: unknown[]) =>
    new Promise<T>((resolve, reject) => {
        const id = nextCall++;
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        post({ t: "call", id, method, args });
    });

const listeners = new Map<string, Set<(payload: any) => void>>();
function on(name: string, cb: (payload: any) => void): Disposable {
    let set = listeners.get(name);
    if (!set) {
        set = new Set();
        listeners.set(name, set);
        void call("events.subscribe", name);
    }
    set.add(cb);
    return { dispose: () => set.delete(cb) };
}

const commands = new Map<string, (arg?: string) => unknown>();
let plugin: VanittyPlugin | undefined;

function makeApi(name: string, platform: VanittyAPI["platform"]): VanittyAPI {
    const qualify = (id: string) => (/[:.]/.test(id) ? id : `${name}:${id}`);
    return {
        pluginName: name,
        platform,
        commands: {
            register(id, handler) {
                const full = qualify(id);
                commands.set(full, handler);
                void call("commands.register", full);
                return {
                    dispose: () => {
                        commands.delete(full);
                        void call("commands.unregister", full);
                    },
                };
            },
            execute: (id, arg) => call("commands.execute", id, arg),
        },
        terminals: {
            list: () => call("terminals.list"),
            active: () => call("terminals.active"),
            write: (text, id) => call("terminals.write", text, id),
            onDidOpen: (cb) => on("terminal.open", cb),
            onDidClose: (cb) => on("terminal.close", cb),
            onDidChangeActive: (cb) => on("terminal.active", cb),
            onDidChangeTitle: (cb) => on("terminal.title", cb),
            onData: (cb) => on("terminal.data", cb),
            onInput: (cb) => on("terminal.input", cb),
        },
        config: {
            get: () => call("config.get"),
            onDidChange: (cb) => on("config", cb),
        },
        window: {
            showNotification: (text, options) =>
                void call("window.notify", String(text), !!options?.error),
        },
        ui: {
            setHeaderItem: (id, item) => void call("ui.setHeaderItem", qualify(id), item),
        },
    };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

self.onmessage = async (e: MessageEvent<HostToWorker>) => {
    const m = e.data;
    switch (m.t) {
        case "activate": {
            try {
                const mod = makeRequire(m.sources, m.platform)(m.entry);
                plugin = (mod?.activate ? mod : mod?.default) as VanittyPlugin;
                if (typeof plugin?.activate !== "function")
                    throw new Error("it doesn't export activate()");
                await plugin.activate(makeApi(m.name, m.platform as VanittyAPI["platform"]));
                post({ t: "ready" });
            } catch (err) {
                post({ t: "failed", error: errorText(err) });
            }
            break;
        }
        case "result": {
            const p = pending.get(m.id);
            pending.delete(m.id);
            if (m.error !== undefined) p?.reject(new Error(m.error));
            else p?.resolve(m.value);
            break;
        }
        case "event":
            for (const cb of listeners.get(m.name) ?? []) {
                try {
                    cb(m.payload);
                } catch (err) {
                    console.error(err);
                }
            }
            break;
        case "invoke": {
            const handler = commands.get(m.command);
            try {
                const value = await handler?.(m.arg);
                post({
                    t: "result",
                    id: m.id,
                    value: value === undefined ? undefined : JSON.parse(JSON.stringify(value)),
                });
            } catch (err) {
                post({ t: "result", id: m.id, error: errorText(err) });
            }
            break;
        }
        case "deactivate":
            try {
                await plugin?.deactivate?.();
            } finally {
                post({ t: "deactivated" });
            }
            break;
    }
};
