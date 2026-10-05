import { invoke } from "@tauri-apps/api/core";
import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

import {
    activeTerm,
    closePane,
    fontSize,
    jumpTab,
    movePane,
    moveTab,
    newTab,
    setFontSizeOverride,
    setSearch,
    split,
} from "./actions";
import { KEYBINDINGS_TEMPLATE, SETTINGS_TEMPLATE } from "./config/defaults";
import { importHyperConfig } from "./config/hyper";
import { defaultKeybindings } from "./config/keymaps";
import { orElse } from "./helpers";
import { reopenSession } from "./persist";
import { hasPluginCommand, runPluginCommand } from "./plugins/host";
import { activeSessionUid, getState, notify, setState } from "./store";

/** Return false to let the key through (e.g. Escape with no search open). */
type Command = (argument?: string) => void | boolean | Promise<unknown>;

const send = (data: string) => () => activeTerm()?.write(data);

/** Is focus in one of our own text inputs (not a terminal)? */
const inInput = () => {
    const element = document.activeElement;
    return (
        element instanceof HTMLInputElement ||
        (element instanceof HTMLTextAreaElement &&
            !element.classList.contains("xterm-helper-textarea"))
    );
};

const win = () => getCurrentWindow();

export const COMMANDS: Record<string, Command> = {
    "window:new": () => invoke("window_new"),
    "window:close": () => win().close(),
    "window:minimize": () => win().minimize(),
    "window:zoom": () => win().toggleMaximize(),
    "window:toggleFullScreen": async () => {
        const w = win();
        await w.setFullscreen(!(await w.isFullscreen()));
    },
    "window:toggleKeepOnTop": async () => {
        const w = win();
        await w.setAlwaysOnTop(!(await w.isAlwaysOnTop()));
    },
    "window:devtools": () => invoke("plugin:webview|internal_toggle_devtools"),
    "window:reload": () => window.dispatchEvent(new CustomEvent("vanitty:reload-config")),
    "window:reloadFull": () => location.reload(),
    "window:preferences": () =>
        invoke("config_open", { name: "settings.json", fallback: SETTINGS_TEMPLATE }),
    "window:keybindings": () =>
        invoke("config_open", { name: "keybindings.json", fallback: KEYBINDINGS_TEMPLATE }),
    "window:defaultKeybindings": async () => {
        const text =
            "// Default keybindings for this platform. Read-only reference:\n// override them in keybindings.json.\n" +
            JSON.stringify(defaultKeybindings(), null, 2) +
            "\n";
        await invoke("config_write", { name: "keybindings.default.json", contents: text });
        await invoke("config_open", { name: "keybindings.default.json", fallback: text });
    },
    "window:themes": () => setState({ themePicker: true }),
    "window:hamburgerMenu": () => window.dispatchEvent(new CustomEvent("vanitty:hamburger")),
    "window:reopenSession": () => reopenSession(),
    "app:quit": async () => {
        // Keep every window for the next launch, not just the last one closed.
        await orElse(invoke("session_quitting"), undefined);
        const windows = await getAllWindows();
        for (const w of windows) await w.close();
    },
    "app:installCommand": async () => {
        const path = await invoke<string>("cli_install");
        notify(`Installed the vanitty command at ${path}. Run vanitty --help to see what it does.`);
    },
    "app:importHyper": async () => {
        const imported = await importHyperConfig();
        if (!imported) {
            notify("No Hyper config found.");
            return;
        }
        const current = await invoke<string | null>("config_read", { name: "settings.json" });
        if (current)
            await invoke("config_write", { name: "settings.backup.json", contents: current });
        await invoke("config_write", { name: "settings.json", contents: imported.settings });
        await invoke("config_write", { name: "keybindings.json", contents: imported.keybindings });
        notify(`Imported ${imported.from}. Your previous settings are in settings.backup.json.`);
        for (const n of imported.notes) notify(n);
    },

    "zoom:reset": () => setFontSizeOverride(null),
    "zoom:in": () => setFontSizeOverride(fontSize() + 1),
    "zoom:out": () => {
        const size = fontSize();
        // xterm misrenders below 5px.
        if (size > 5) setFontSizeOverride(size - 1);
    },

    "tab:new": (profile) => newTab(profile),
    "tab:next": () => moveTab(1),
    "tab:prev": () => moveTab(-1),
    "pane:next": () => movePane(1),
    "pane:prev": () => movePane(-1),
    "pane:splitRight": (profile) => split("vertical", profile),
    "pane:splitDown": (profile) => split("horizontal", profile),
    "pane:close": () => closePane(),

    "editor:undo": () => {},
    "editor:redo": () => {},
    "editor:cut": () => COMMANDS["editor:copy"](),
    "editor:copy": () => {
        if (inInput()) return document.execCommand("copy");
        const term = activeTerm()?.term;
        if (term?.hasSelection()) void writeText(term.getSelection());
    },
    "editor:paste": async () => {
        const text = await orElse(readText(), "");
        if (!text) return;
        if (inInput()) document.execCommand("insertText", false, text);
        else activeTerm()?.paste(text);
    },
    "editor:selectAll": () => {
        if (inInput()) return document.execCommand("selectAll");
        activeTerm()?.term.selectAll();
    },
    "editor:clearBuffer": () => activeTerm()?.term.clear(),
    "editor:search": () => setSearch(activeSessionUid(), true),
    "editor:search-close": () => {
        const s = activeSessionUid();
        if (!s || !getState().sessions[s]?.search) return false;
        setSearch(s, false);
    },
    "editor:movePreviousWord": send("\u{1B}b"),
    "editor:moveNextWord": send("\u{1B}f"),
    "editor:moveBeginningLine": send("\u{1B}OH"),
    "editor:moveEndLine": send("\u{1B}OF"),
    "editor:deletePreviousWord": send("\u{1B}\u{7F}"),
    "editor:deleteNextWord": send("\u{1B}d"),
    "editor:deleteBeginningLine": send("\u{15}"),
    "editor:deleteEndLine": send("\u{B}"),
    "editor:break": send("\u{3}"),
    "editor:stop": send("\u{1A}"),
    "editor:quit": send("\u{1C}"),
    "editor:tmux": send("\u{2}"),
};

for (let index = 1; index <= 8; index++) COMMANDS[`tab:jump:${index}`] = () => jumpTab(index - 1);
COMMANDS["tab:jump:last"] = () => jumpTab("last");

export const COMMAND_IDS = Object.keys(COMMANDS);

const PROFILE_COMMAND = /^(tab:new|pane:splitRight|pane:splitDown|window:new):(.+)$/;

/** Runs a command; "tab:new:<profile>" style ids pass the profile along. */
export function runCommand(id: string, argument?: string): boolean {
    const m = PROFILE_COMMAND.exec(id);
    const handler = COMMANDS[m ? m[1] : id];
    if (!handler) return hasPluginCommand(id) && runPluginCommand(id, argument);
    const result = handler(m?.[2] ?? argument);
    if (result instanceof Promise) {
        void result.catch((error) => notify(`${id} failed: ${error}`, true));
        return true;
    }
    return result !== false;
}

/** Editor commands make no sense while typing in a text field. */
export function commandAllowedInInput(id: string) {
    return (
        !id.startsWith("editor:") ||
        id === "editor:search-close" ||
        id === "editor:copy" ||
        id === "editor:paste" ||
        id === "editor:selectAll" ||
        id === "editor:cut"
    );
}

export { inInput };

export { focusActive } from "./actions";
