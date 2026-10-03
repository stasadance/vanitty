import { invoke } from "@tauri-apps/api/core";
import { getAllWindows, getCurrentWindow } from "@tauri-apps/api/window";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
    activeTerm,
    closePane,
    focusActive,
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
import { hasPluginCommand, runPluginCommand } from "./plugins/host";
import { activeSessionUid, getState, notify } from "./store";

/** Return false to let the key through (e.g. Escape with no search open). */
type Command = (arg?: string) => void | boolean | Promise<unknown>;

const send = (data: string) => () => activeTerm()?.write(data);

/** Is focus in one of our own text inputs (not a terminal)? */
const inInput = () => {
    const el = document.activeElement;
    return (
        el instanceof HTMLInputElement ||
        (el instanceof HTMLTextAreaElement && !el.classList.contains("xterm-helper-textarea"))
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
    "window:hamburgerMenu": () => window.dispatchEvent(new CustomEvent("vanitty:hamburger")),
    "app:quit": async () => {
        // Keep every window for the next launch, not just the last one closed.
        await invoke("session_quitting").catch(() => {});
        for (const w of await getAllWindows()) await w.close();
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
        const text = await readText().catch(() => "");
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
    "editor:movePreviousWord": send("\x1bb"),
    "editor:moveNextWord": send("\x1bf"),
    "editor:moveBeginningLine": send("\x1bOH"),
    "editor:moveEndLine": send("\x1bOF"),
    "editor:deletePreviousWord": send("\x1b\x7f"),
    "editor:deleteNextWord": send("\x1bd"),
    "editor:deleteBeginningLine": send("\x15"),
    "editor:deleteEndLine": send("\x0b"),
    "editor:break": send("\x03"),
    "editor:stop": send("\x1a"),
    "editor:quit": send("\x1c"),
    "editor:tmux": send("\x02"),
};

for (let i = 1; i <= 8; i++) COMMANDS[`tab:jump:${i}`] = () => jumpTab(i - 1);
COMMANDS["tab:jump:last"] = () => jumpTab("last");

export const COMMAND_IDS = Object.keys(COMMANDS);

const PROFILE_COMMAND = /^(tab:new|pane:splitRight|pane:splitDown|window:new):(.+)$/;

/** Runs a command; "tab:new:<profile>" style ids pass the profile along. */
export function runCommand(id: string, arg?: string): boolean {
    const m = PROFILE_COMMAND.exec(id);
    const fn = m ? COMMANDS[m[1]] : COMMANDS[id];
    if (!fn) return hasPluginCommand(id) ? runPluginCommand(id, arg) : false;
    const result = fn(m?.[2] ?? arg);
    if (result instanceof Promise) {
        result.catch((e) => notify(`${id} failed: ${e}`, true));
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

export { inInput, focusActive };
