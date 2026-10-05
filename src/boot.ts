import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { activeTerm, applyConfigToTerms, newTab } from "./actions";
import { COMMAND_IDS, commandAllowedInInput, inInput, runCommand } from "./commands";
import { eventKey, platform } from "./config/keymaps";
import { ensureConfigFiles, loadConfig } from "./config/load";
import { installAppMenu, popupHamburger } from "./menu";
import { restoreSession, trackSession } from "./persist";
import { emit, syncPlugins } from "./plugins/host";
import { activeSessionUid, getState, notify, setState, useStore } from "./store";
import { terms } from "./terms/registry";
import { startUpdateChecks } from "./updates";

let configErrors: string[] = [];

async function reloadConfig() {
    const { config, keymap, errors } = await loadConfig();
    setState({ config, keymap });
    applyConfigToTerms();
    // Show each config problem once, and drop the ones that got fixed.
    setState((s) => ({
        notifications: s.notifications.filter(
            (n) => !configErrors.includes(n.text) || errors.includes(n.text),
        ),
    }));
    for (const error of errors) if (!configErrors.includes(error)) notify(error, true);
    configErrors = errors;
    await installAppMenu().catch(() => {});
    await syncPlugins({
        runCommand,
        writeToTerminal: (text, id) => (id ? terms.get(id) : activeTerm())?.write(text),
    }).catch((error) => notify(`Couldn't load plugins: ${error}`, true));
}

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
}

let isBooted = false;

export async function boot() {
    if (isBooted) return;
    isBooted = true;

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("vanitty:reload-config", () => void reloadConfig());

    const notes = await ensureConfigFiles(COMMAND_IDS).catch((error) => [
        `Couldn't set up config files: ${error}`,
    ]);
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

    // xterm measures the font when a terminal opens, so the bundled font must
    // be ready first or cells come out the fallback font's size.
    await Promise.all(
        ["400", "700"].map((w) =>
            document.fonts.load(`${w} 13px "FiraCode Nerd Font Mono"`).catch(() => []),
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
}
