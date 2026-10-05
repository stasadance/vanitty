export type Platform = "macos" | "linux" | "windows";

function detectPlatform(): Platform {
    if (/Mac/.test(navigator.userAgent)) return "macos";
    return /Win/.test(navigator.userAgent) ? "windows" : "linux";
}

export const platform = detectPlatform();
export const isMac = platform === "macos";
/**
 * Hyper zooms its page to 1.2 on Linux to get a normal default size there.
 * Vanitty scales the UI with CSS zoom and the terminal font by the same factor
 * instead, so devicePixelRatio stays whole and WebGL text stays sharp.
 */
export const uiScale = platform === "linux" ? 1.2 : 1;

type Keymap = Record<string, string | string[]>;

// Hyper's default keymaps, per platform.
const darwin: Keymap = {
    "window:devtools": "command+alt+i",
    "window:reload": "command+shift+r",
    "window:reloadFull": "command+shift+f5",
    "window:preferences": "command+,",
    "zoom:reset": "command+0",
    "zoom:in": ["command+plus", "command+="],
    "zoom:out": "command+-",
    "window:new": "command+n",
    "window:minimize": "command+m",
    "window:zoom": "ctrl+alt+command+m",
    "window:toggleFullScreen": "command+ctrl+f",
    "window:close": "command+shift+w",
    "tab:new": "command+t",
    "tab:next": ["command+shift+]", "command+shift+right", "command+alt+right", "ctrl+tab"],
    "tab:prev": ["command+shift+[", "command+shift+left", "command+alt+left", "ctrl+shift+tab"],
    "tab:jump:prefix": "command",
    "pane:next": "command+]",
    "pane:prev": "command+[",
    "pane:splitRight": "command+d",
    "pane:splitDown": "command+shift+d",
    "pane:close": "command+w",
    "editor:undo": "command+z",
    "editor:redo": "command+y",
    "editor:cut": "command+x",
    "editor:copy": "command+c",
    "editor:paste": "command+v",
    "editor:selectAll": "command+a",
    "editor:search": "command+f",
    "editor:search-close": "esc",
    "editor:movePreviousWord": "alt+left",
    "editor:moveNextWord": "alt+right",
    "editor:moveBeginningLine": "command+left",
    "editor:moveEndLine": "command+right",
    "editor:deletePreviousWord": "alt+backspace",
    "editor:deleteNextWord": "alt+delete",
    "editor:deleteBeginningLine": "command+backspace",
    "editor:deleteEndLine": "command+delete",
    "editor:clearBuffer": "command+k",
    "editor:break": "ctrl+c",
    "app:quit": "command+q",
};

const linux: Keymap = {
    "window:devtools": "ctrl+shift+i",
    "window:reload": "ctrl+shift+r",
    "window:reloadFull": "ctrl+shift+f5",
    "window:preferences": "ctrl+,",
    "window:hamburgerMenu": "alt+f",
    "zoom:reset": "ctrl+0",
    "zoom:in": "ctrl+=",
    "zoom:out": "ctrl+-",
    "window:new": "ctrl+shift+n",
    "window:minimize": "ctrl+shift+m",
    "window:zoom": "ctrl+shift+alt+m",
    "window:toggleFullScreen": "f11",
    "window:close": "ctrl+shift+q",
    "tab:new": "ctrl+shift+t",
    "tab:next": ["ctrl+shift+]", "ctrl+shift+right", "ctrl+alt+right", "ctrl+tab"],
    "tab:prev": ["ctrl+shift+[", "ctrl+shift+left", "ctrl+alt+left", "ctrl+shift+tab"],
    "tab:jump:prefix": "ctrl",
    "pane:next": "ctrl+pageup",
    "pane:prev": "ctrl+pagedown",
    "pane:splitRight": "ctrl+shift+d",
    "pane:splitDown": "ctrl+shift+e",
    "pane:close": "ctrl+shift+w",
    "editor:undo": "ctrl+shift+z",
    "editor:redo": "ctrl+shift+y",
    "editor:cut": "ctrl+shift+x",
    "editor:copy": "ctrl+shift+c",
    "editor:paste": "ctrl+shift+v",
    "editor:selectAll": "ctrl+shift+a",
    "editor:search": "ctrl+shift+f",
    "editor:search-close": "esc",
    "editor:movePreviousWord": "ctrl+left",
    "editor:moveNextWord": "ctrl+right",
    "editor:moveBeginningLine": "home",
    "editor:moveEndLine": "end",
    "editor:deletePreviousWord": "ctrl+backspace",
    "editor:deleteNextWord": "ctrl+del",
    "editor:deleteBeginningLine": "ctrl+home",
    "editor:deleteEndLine": "ctrl+end",
    "editor:clearBuffer": "ctrl+shift+k",
    "editor:break": "ctrl+c",
};

const windows: Keymap = {
    ...linux,
    "window:close": ["ctrl+shift+q", "alt+f4"],
    "tab:next": ["ctrl+tab"],
    "tab:prev": ["ctrl+shift+tab"],
    "editor:movePreviousWord": "",
    "editor:moveNextWord": "",
};

export const DEFAULT_KEYMAP: Keymap = { macos: darwin, linux, windows }[platform];

export interface Keybinding {
    key: string;
    command: string;
}

const MOD_ALIASES: Record<string, string> = {
    command: "meta",
    cmd: "meta",
    meta: "meta",
    super: "meta",
    win: "meta",
    ctrl: "ctrl",
    control: "ctrl",
    alt: "alt",
    option: "alt",
    opt: "alt",
    shift: "shift",
};

const KEY_ALIASES: Record<string, string> = {
    plus: "=",
    escape: "esc",
    del: "delete",
    return: "enter",
    space: " ",
    arrowleft: "left",
    arrowright: "right",
    arrowup: "up",
    arrowdown: "down",
};

const MOD_ORDER = ["ctrl", "alt", "shift", "meta"];

/** Canonical form, e.g. "ctrl+shift+t". Returns "" for an empty binding. */
export function normalizeKey(key: string): string {
    const parts = key
        .toLowerCase()
        .replace(/\+\+$/, "+plus")
        .split("+")
        .map((p) => p.trim())
        .filter(Boolean);
    const mods = new Set<string>();
    let main = "";
    for (const p of parts) {
        if (MOD_ALIASES[p]) mods.add(MOD_ALIASES[p]);
        else main = KEY_ALIASES[p] ?? p;
    }
    return main ? [...MOD_ORDER.filter((m) => mods.has(m)), main].join("+") : "";
}

const CODE_KEYS: Record<string, string> = {
    BracketLeft: "[",
    BracketRight: "]",
    Equal: "=",
    Minus: "-",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Backquote: "`",
    NumpadAdd: "=",
    NumpadSubtract: "-",
};

/** The canonical key for a keyboard event, matching `normalizeKey`. */
export function eventKey(event: KeyboardEvent): string {
    let main: string;
    if (/^Key[A-Z]$/.test(event.code)) main = event.code.slice(3).toLowerCase();
    else if (/^Digit\d$/.test(event.code)) main = event.code.slice(5);
    else if (/^Numpad\d$/.test(event.code)) main = event.code.slice(6);
    else if (CODE_KEYS[event.code]) main = CODE_KEYS[event.code];
    else main = KEY_ALIASES[event.key.toLowerCase()] ?? event.key.toLowerCase();
    if (["control", "shift", "alt", "meta"].includes(main)) return "";
    const mods = [
        event.ctrlKey && "ctrl",
        event.altKey && "alt",
        event.shiftKey && "shift",
        event.metaKey && "meta",
    ].filter(Boolean);
    return [...mods, main].join("+");
}

/**
 * Resolves the final key → command map: platform defaults, then the user's
 * keybindings.json in order, VS Code style ("-command" removes a binding).
 * Legacy Hyper `keymaps` objects are accepted too.
 */
export function buildKeymap(user: Keybinding[]): Map<string, string> {
    const bindings: Keybinding[] = [];
    const add = (command: string, keys: string | string[]) => {
        for (const key of [keys].flat()) bindings.push({ key, command });
    };
    for (const [command, keys] of Object.entries(DEFAULT_KEYMAP)) {
        if (command === "tab:jump:prefix") continue;
        add(command, keys);
    }
    const prefix = DEFAULT_KEYMAP["tab:jump:prefix"] as string;
    for (let index = 1; index <= 8; index++) add(`tab:jump:${index}`, `${prefix}+${index}`);
    add("tab:jump:last", `${prefix}+9`);

    for (const b of user) {
        if (b.command.startsWith("-")) {
            const command = b.command.slice(1);
            const key = b.key ? normalizeKey(b.key) : "";
            for (let index = bindings.length - 1; index >= 0; index--) {
                if (
                    bindings[index].command === command &&
                    (!key || normalizeKey(bindings[index].key) === key)
                ) {
                    bindings.splice(index, 1);
                }
            }
        } else {
            bindings.push(b);
        }
    }

    const map = new Map<string, string>();
    for (const b of bindings) {
        const key = normalizeKey(b.key);
        if (key) map.set(key, b.command);
    }
    return map;
}

/** Converts a Hyper `keymaps` object to keybindings.json entries. */
export function fromHyperKeymaps(keymaps: Keymap): Keybinding[] {
    const out: Keybinding[] = [];
    for (const [command, keys] of Object.entries(keymaps)) {
        if (command === "tab:jump:prefix") {
            for (let index = 1; index <= 8; index++)
                out.push({ key: `${keys}+${index}`, command: `tab:jump:${index}` });
            out.push({ key: `${keys}+9`, command: "tab:jump:last" });
            continue;
        }
        // Hyper replaced a command's default keys when you rebound it.
        out.push({ key: "", command: `-${command}` });
        for (const key of [keys].flat()) if (key) out.push({ key, command });
    }
    return out;
}

/** All default bindings, for the "Show Default Keybindings" file. */
export function defaultKeybindings(): Keybinding[] {
    return [...buildKeymap([])].map(([key, command]) => ({ key, command }));
}

/** First key bound to a command, formatted for menus. */
export function keyFor(map: Map<string, string>, command: string): string | undefined {
    for (const [key, bound] of map) if (bound === command) return key;
    return undefined;
}
