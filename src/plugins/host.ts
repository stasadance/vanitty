import { invoke } from "@tauri-apps/api/core";

import { platform } from "../config/keymaps";
import { serial } from "../helpers";
import { getState, notify, setState, type State } from "../store";

import type { InstallResult } from "../themes";
import type { HeaderItem, TerminalInfo } from "./api";
import type { HostToWorker, WorkerToHost } from "./protocol";

/** How long a plugin may take to activate before it is stopped. */
const ACTIVATE_TIMEOUT_MS = 10_000;

interface Bridge {
    runCommand(id: string, argument?: string): boolean;
    writeToTerminal(text: string, id?: string): void;
}

class PluginWorker {
    private worker: Worker;
    private nextId = 0;
    private pending = new Map<number, (r: { value?: unknown; error?: string }) => void>();
    private headerItems = new Set<string>();
    private onReady = () => {};
    readonly subscriptions = new Set<string>();
    readonly commands = new Set<string>();
    ready: Promise<void>;

    constructor(
        readonly name: string,
        entry: string,
        sources: Record<string, string>,
        private bridge: Bridge,
    ) {
        this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
            type: "module",
            name: `plugin:${name}`,
        });
        this.worker.addEventListener("message", (event: MessageEvent<WorkerToHost>) =>
            this.onMessage(event.data),
        );
        this.worker.addEventListener("error", (event) =>
            notify(`Plugin ${name}: ${event.message}`, true),
        );
        const timer = setTimeout(() => {
            notify(`Plugin ${name} took too long to start and was stopped.`, true);
            this.stop();
        }, ACTIVATE_TIMEOUT_MS);
        this.ready = new Promise((resolve) => {
            this.onReady = () => {
                clearTimeout(timer);
                resolve();
            };
        });
        this.post({ t: "activate", name, entry, sources, platform });
    }

    private onMessage(m: WorkerToHost) {
        switch (m.t) {
            case "ready": {
                this.onReady();
                break;
            }
            case "failed": {
                notify(`Plugin ${this.name} failed to start: ${m.error}`, true);
                this.stop();
                break;
            }
            case "result": {
                this.pending.get(m.id)?.(m);
                this.pending.delete(m.id);
                break;
            }
            case "call": {
                void this.handle(m.method, m.args)
                    .then((value) => this.post({ t: "result", id: m.id, value }))
                    .catch((error) =>
                        this.post({
                            t: "result",
                            id: m.id,
                            error: String(error instanceof Error ? error.message : error),
                        }),
                    );
                break;
            }
        }
    }

    private async handle(method: string, parameters: unknown[]): Promise<unknown> {
        const s = getState();
        switch (method) {
            case "events.subscribe": {
                this.subscriptions.add(String(parameters[0]));
                return;
            }
            case "commands.register": {
                this.commands.add(String(parameters[0]));
                pluginCommands.set(String(parameters[0]), this);
                return;
            }
            case "commands.unregister": {
                this.commands.delete(String(parameters[0]));
                pluginCommands.delete(String(parameters[0]));
                return;
            }
            case "commands.execute": {
                if (
                    !this.bridge.runCommand(
                        String(parameters[0]),
                        parameters[1] === undefined ? undefined : String(parameters[1]),
                    )
                ) {
                    throw new Error(`Unknown command ${parameters[0]}`);
                }
                return;
            }
            case "terminals.list": {
                return terminalInfos(s);
            }
            case "terminals.active": {
                return terminalInfos(s).find((t) => t.active);
            }
            case "terminals.write": {
                this.bridge.writeToTerminal(
                    String(parameters[0]),
                    parameters[1] === undefined ? undefined : String(parameters[1]),
                );
                return;
            }
            case "config.get": {
                return s.config;
            }
            case "window.notify": {
                notify(`${this.name}: ${parameters[0]}`, !!parameters[1]);
                return;
            }
            case "ui.setHeaderItem": {
                const id = String(parameters[0]);
                const item = parameters[1] as HeaderItem | null;
                if (item) this.headerItems.add(id);
                else this.headerItems.delete(id);
                setHeaderItem(
                    id,
                    item ? { text: item.text, tooltip: item.tooltip, command: item.command } : null,
                );
                return;
            }
            default: {
                throw new Error(`Unknown method ${method}`);
            }
        }
    }

    post(m: HostToWorker) {
        this.worker.postMessage(m);
    }

    emit(name: string, payload: unknown) {
        if (this.subscriptions.has(name)) this.post({ t: "event", name, payload });
    }

    invoke(command: string, argument?: string) {
        const id = this.nextId++;
        return new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, (r) =>
                r.error === undefined ? resolve(r.value) : reject(new Error(r.error)),
            );
            this.post({ t: "invoke", id, command, arg: argument });
        });
    }

    stop() {
        this.post({ t: "deactivate" });
        // Give deactivate() a moment, then terminate regardless.
        setTimeout(() => this.worker.terminate(), 500);
        for (const id of this.headerItems) setHeaderItem(id, null);
        for (const c of this.commands) pluginCommands.delete(c);
    }
}

function setHeaderItem(id: string, item: HeaderItem | null) {
    setState((s) => {
        const headerItems = { ...s.headerItems };
        if (item) headerItems[id] = item;
        else delete headerItems[id];
        return { headerItems };
    });
}

export function terminalInfos(s: State): TerminalInfo[] {
    const active = s.activeRoot ? s.activeSessions[s.activeRoot] : undefined;
    return Object.values(s.sessions).map((x) => ({
        id: x.uid,
        title: x.title,
        profile: x.profile,
        active: x.uid === active,
    }));
}

const pluginCommands = new Map<string, PluginWorker>();

export function hasPluginCommand(id: string) {
    return pluginCommands.has(id);
}

export function runPluginCommand(id: string, argument?: string) {
    const w = pluginCommands.get(id);
    if (!w) return false;
    void w.invoke(id, argument).catch((error) => notify(`${id}: ${error.message}`, true));
    return true;
}

/** The running plugin workers. */
class Plugins {
    private workers: PluginWorker[] = [];
    private loadedKey = "";

    emit(name: string, payload: unknown) {
        for (const w of this.workers) w.emit(name, payload);
    }

    wants(name: string) {
        return this.workers.some((w) => w.subscriptions.has(name));
    }

    async sync(bridge: Bridge) {
        const { plugins = [], localPlugins = [] } = getState().config;
        const npm = plugins.filter((p) => typeof p === "string" && p.trim());
        const local = localPlugins.filter((p) => typeof p === "string" && /^[\w.-]+$/.test(p));
        const key = JSON.stringify([npm, local]);
        if (key === this.loadedKey) {
            this.emit("config", getState().config);
            return;
        }
        this.loadedKey = key;
        for (const w of this.workers) w.stop();
        this.workers = [];
        if (npm.length === 0 && local.length === 0) return;

        if (npm.length > 0) {
            const results = await invoke<InstallResult[]>("packages_install", {
                kind: "plugins",
                specs: npm,
                force: false,
            });
            for (const r of results)
                if (r.error) notify(`Couldn't install plugin ${r.name}: ${r.error}`, true);
        }
        const sources = await invoke<Record<string, string>>("packages_sources", {
            kind: "plugins",
        });
        const names = [...npm.map((spec) => packageName(spec)), ...local.map((l) => `@local/${l}`)];
        for (const name of names) {
            if (Object.keys(sources).every((k) => !k.startsWith(`${name}/`))) {
                notify(`Plugin ${name} isn't installed.`, true);
                continue;
            }
            this.workers.push(
                new PluginWorker(name.replace(/^@local\//, ""), name, sources, bridge),
            );
        }
    }
}

const plugins = new Plugins();
const syncs = serial();

export const emit = (name: string, payload: unknown) => plugins.emit(name, payload);

/** True when any plugin listens for this event (skips work for terminal output). */
export const isWanted = (name: string) => plugins.wants(name);

/** Starts the plugins in settings, restarting all when the list changes. One sync at a time. */
export const syncPlugins = (bridge: Bridge) => syncs(() => plugins.sync(bridge));

function packageName(spec: string) {
    const s = spec.trim().split("#", 1)[0];
    const at = s.indexOf("@", s.startsWith("@") ? 1 : 0);
    return at > 0 ? s.slice(0, at) : s;
}
