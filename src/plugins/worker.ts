/// <reference lib="webworker" />
import { counter } from "../helpers";
import { lockdown, makeRequire } from "../sandbox/require";

import type { Disposable, VanittyAPI, VanittyPlugin } from "./api";
import type { HostToWorker, WorkerToHost } from "./protocol";

lockdown();

const post = (m: WorkerToHost) => self.postMessage(m);

const nextCall = counter();
const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (error: Error) => void }
>();
const call = <T>(method: string, ...parameters: unknown[]) =>
    new Promise<T>((resolve, reject) => {
        const id = nextCall();
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        post({ t: "call", id, method, args: parameters });
    });

// Each listener takes its own event payload type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listeners = new Map<string, Set<(payload: any) => void>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function on(name: string, callback: (payload: any) => void): Disposable {
    let set = listeners.get(name);
    if (!set) {
        set = new Set();
        listeners.set(name, set);
        void call("events.subscribe", name);
    }
    set.add(callback);
    return { dispose: () => set.delete(callback) };
}

const commands = new Map<string, (argument?: string) => unknown>();

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
            execute: (id, argument) => call("commands.execute", id, argument),
        },
        terminals: {
            list: () => call("terminals.list"),
            active: () => call("terminals.active"),
            write: (text, id) => call("terminals.write", text, id),
            onDidOpen: (callback) => on("terminal.open", callback),
            onDidClose: (callback) => on("terminal.close", callback),
            onDidChangeActive: (callback) => on("terminal.active", callback),
            onDidChangeTitle: (callback) => on("terminal.title", callback),
            onData: (callback) => on("terminal.data", callback),
            onInput: (callback) => on("terminal.input", callback),
        },
        config: {
            get: () => call("config.get"),
            onDidChange: (callback) => on("config", callback),
        },
        window: {
            showNotification: (text, options) => void call("window.notify", text, !!options?.error),
        },
        ui: {
            setHeaderItem: (id, item) => void call("ui.setHeaderItem", qualify(id), item),
        },
    };
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Hosts one plugin, activated by the first message. */
function serve() {
    let plugin: VanittyPlugin | undefined;
    self.addEventListener("message", async (event: MessageEvent<HostToWorker>) => {
        const m = event.data;
        switch (m.t) {
            case "activate": {
                try {
                    const loaded = makeRequire(m.sources, m.platform)(m.entry);
                    plugin = (loaded?.activate ? loaded : loaded?.default) as VanittyPlugin;
                    if (typeof plugin?.activate !== "function")
                        throw new TypeError("it doesn't export activate()");
                    await plugin.activate(makeApi(m.name, m.platform as VanittyAPI["platform"]));
                    post({ t: "ready" });
                } catch (error) {
                    post({ t: "failed", error: errorText(error) });
                }
                break;
            }
            case "result": {
                const p = pending.get(m.id);
                pending.delete(m.id);
                if (m.error === undefined) {
                    p?.resolve(m.value);
                } else {
                    p?.reject(new Error(m.error));
                }
                break;
            }
            case "event": {
                const callbacks = listeners.get(m.name) ?? [];
                for (const callback of callbacks) {
                    try {
                        callback(m.payload);
                    } catch (error) {
                        console.error(error);
                    }
                }
                break;
            }
            case "invoke": {
                const handler = commands.get(m.command);
                try {
                    const value = await handler?.(m.arg);
                    post({
                        t: "result",
                        id: m.id,
                        value:
                            value === undefined
                                ? undefined
                                : // structuredClone throws on functions; JSON drops them.
                                  // eslint-disable-next-line unicorn/prefer-structured-clone
                                  JSON.parse(JSON.stringify(value)),
                    });
                } catch (error) {
                    post({ t: "result", id: m.id, error: errorText(error) });
                }
                break;
            }
            case "deactivate": {
                try {
                    await plugin?.deactivate?.();
                } finally {
                    post({ t: "deactivated" });
                }
                break;
            }
        }
    });
}

serve();
