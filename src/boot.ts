import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { activeTerm, applyConfigToTerms, newTab } from "./actions";
import { COMMAND_IDS, commandAllowedInInput, inInput, runCommand } from "./commands";
import { eventKey, platform } from "./config/keymaps";
import { ensureConfigFiles, loadConfig } from "./config/load";
import { once, orElse, serial } from "./helpers";
import { installAppMenu, popupHamburger } from "./menu";
import { restoreSession, trackSession } from "./persist";
import { emit, syncPlugins } from "./plugins/host";
import { activeSessionUid, getState, notify, setState, useStore } from "./store";
import { terms } from "./terms/registry";
import { startUpdateChecks } from "./updates";

const reloads = serial();

/** Reloads settings, keybindings and plugins, one reload at a time. */
const reloadConfig = () =>
    reloads(async () => {
        const { config, keymap, errors } = await loadConfig();
        const shown = getState().configErrors;
        // Show each config problem once, and drop the ones that got fixed.
        setState((s) => ({
            config,
            keymap,
            configErrors: errors,
            notifications: s.notifications.filter(
                (n) => !shown.includes(n.text) || errors.includes(n.text),
            ),
        }));
        applyConfigToTerms();
        for (const error of errors) if (!shown.includes(error)) notify(error, true);
        await orElse(installAppMenu(), undefined);
        try {
            await syncPlugins({
                runCommand,
                writeToTerminal: (text, id) => (id ? terms.get(id) : activeTerm())?.write(text),
            });
        } catch (error) {
            notify(`Couldn't load plugins: ${error}`, true);
        }
    });

function onKeyDown(event: KeyboardEvent) {
    if (event.isComposing) return;
    const key = eventKey(event);
    if (!key) return;
    const command = getState().keymap.get(key);
    if (!command) return;
    if (inInput() && !commandAllowedInInput(command)) return;
    if (!runCommand(command)) return;
    event.preventDefault();
    event.stopPropagation();
}

function quotePath(p: string) {
    if (platform === "windows") return /\s/.test(p) ? `"${p}"` : p;
    return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replaceAll("'", String.raw`'\''`)}'`;
}

async function trackWindowState() {
    const win = getCurrentWindow();
    const update = async () => {
        const [maximized, fullScreen] = await Promise.all([win.isMaximized(), win.isFullscreen()]);
        setState({ maximized, fullScreen });
    };
    await update();
    await win.onResized(() => void update());
    const systemRadius = await orElse(invoke<number | null>("window_corner_radius"), null);
    setState({ systemRadius });
}

export const boot = once(async () => {
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("vanitty:reload-config", () => void reloadConfig());

    let notes: string[];
    try {
        notes = await ensureConfigFiles(COMMAND_IDS);
    } catch (error) {
        notes = [`Couldn't set up config files: ${error}`];
    }
    await reloadConfig();
    for (const n of notes) notify(n);
    startUpdateChecks();

    let timer: ReturnType<typeof setTimeout> | undefined;
    await listen<string>("config-changed", () => {
        clearTimeout(timer);
        timer = setTimeout(() => void reloadConfig(), 100);
    });

    await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop" || event.payload.paths.length === 0) return;
        const term = activeTerm();
        term?.write(event.payload.paths.map((path) => quotePath(path)).join(" "));
        term?.focus();
    });

    // xterm measures cells on open, so load the bundled font first.
    await Promise.all(
        ["400", "700"].map((w) =>
            orElse(document.fonts.load(`${w} 13px "FiraCode Nerd Font Mono"`), []),
        ),
    );
    window.addEventListener("vanitty:hamburger", () => void popupHamburger(10, 34));

    await trackWindowState();
    useStore.subscribe((s, previous) => {
        const active = activeSessionUid(s);
        if (active && active !== activeSessionUid(previous)) emit("terminal.active", active);
    });
    if (!(await restoreSession())) await newTab();
    await trackSession();
});
