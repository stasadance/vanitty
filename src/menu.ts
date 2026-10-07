import { PhysicalPosition } from "@tauri-apps/api/dpi";
import {
    Menu,
    MenuItem,
    type MenuItemOptions,
    PredefinedMenuItem,
    Submenu,
} from "@tauri-apps/api/menu";

import { runCommand } from "./commands";
import { isMac, keyFor } from "./config/keymaps";
import { getState } from "./store";

/** Tauri accelerator syntax from our "ctrl+shift+t" form. */
function accelerator(key: string | undefined) {
    if (!key) return undefined;
    const parts = key.split("+").map((p) => {
        switch (p) {
            case "meta": {
                return "Cmd";
            }
            case "ctrl": {
                return "Ctrl";
            }
            case "alt": {
                return "Alt";
            }
            case "shift": {
                return "Shift";
            }
            case "esc": {
                return "Escape";
            }
            case "left":
            case "right":
            case "up":
            case "down": {
                return `Arrow${p[0].toUpperCase()}${p.slice(1)}`;
            }
            default: {
                return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
            }
        }
    });
    return parts.join("+");
}

/** Accelerators only on macOS, where the app menu owns shortcuts; elsewhere they'd run twice. */
async function item(text: string, command: string, hasAccelerator = isMac) {
    const options: MenuItemOptions = { text, action: () => void runCommand(command) };
    if (hasAccelerator) {
        const accel = accelerator(keyFor(getState().keymap, command));
        if (accel) options.accelerator = accel;
    }
    return MenuItem.new(options);
}

const separator = () => PredefinedMenuItem.new({ item: "Separator" });

async function newTabProfileItems() {
    const { profiles } = getState().config;
    return profiles.length < 2
        ? []
        : Promise.all(profiles.map((p) => item(p.name, `tab:new:${p.name}`, false)));
}

async function submenus(): Promise<Submenu[]> {
    const newTabProfiles = await newTabProfileItems();
    const shell = await Submenu.new({
        text: "Shell",
        items: [
            await item("New Tab", "tab:new"),
            await item("New Window", "window:new"),
            await item("Reopen Last Session", "window:reopenSession"),
            await item("Save Layout…", "window:saveLayout"),
            await item("Open Layout…", "window:openLayout"),
            ...(newTabProfiles.length > 0
                ? [await Submenu.new({ text: "New Tab with Profile", items: newTabProfiles })]
                : []),
            await separator(),
            await item("Split Right", "pane:splitRight"),
            await item("Split Down", "pane:splitDown"),
            await separator(),
            await item("Close Pane", "pane:close"),
            await item("Close Window", "window:close"),
        ],
    });
    const edit = await Submenu.new({
        text: "Edit",
        items: [
            await item("Copy", "editor:copy"),
            await item("Paste", "editor:paste"),
            await item("Select All", "editor:selectAll"),
            await separator(),
            await item("Find", "editor:search"),
            await item("Clear Buffer", "editor:clearBuffer"),
            ...(isMac ? [] : [await separator(), await item("Preferences…", "window:preferences")]),
        ],
    });
    const view = await Submenu.new({
        text: "View",
        items: [
            await item("Reload Config", "window:reload"),
            await item("Full Reload", "window:reloadFull"),
            await item("Developer Tools", "window:devtools"),
            await separator(),
            await item("Reset Zoom", "zoom:reset"),
            await item("Zoom In", "zoom:in"),
            await item("Zoom Out", "zoom:out"),
        ],
    });
    const windowMenu = await Submenu.new({
        text: "Window",
        items: [
            await item("Minimize", "window:minimize"),
            await item("Zoom", "window:zoom"),
            await item("Toggle Full Screen", "window:toggleFullScreen"),
            await item("Toggle Always on Top", "window:toggleKeepOnTop"),
            await separator(),
            await item("Next Tab", "tab:next"),
            await item("Previous Tab", "tab:prev"),
            await item("Next Pane", "pane:next"),
            await item("Previous Pane", "pane:prev"),
        ],
    });
    const settings = await Submenu.new({
        text: "Settings",
        items: [
            await item("Open Settings", "window:preferences"),
            await item("Open Keybindings", "window:keybindings"),
            await item("Show Default Keybindings", "window:defaultKeybindings"),
            await item("Change Theme…", "window:themes"),
            await separator(),
            await item("Import Hyper Config", "app:importHyper"),
        ],
    });
    return [shell, edit, view, windowMenu, settings];
}

export async function installAppMenu() {
    if (!isMac) return;
    const app = await Submenu.new({
        text: "Vanitty",
        items: [
            await PredefinedMenuItem.new({ item: { About: { name: "Vanitty" } } }),
            await separator(),
            await item("Settings…", "window:preferences"),
            await separator(),
            await PredefinedMenuItem.new({ item: "Hide" }),
            await PredefinedMenuItem.new({ item: "HideOthers" }),
            await PredefinedMenuItem.new({ item: "ShowAll" }),
            await separator(),
            await item("Quit Vanitty", "app:quit"),
        ],
    });
    const menu = await Menu.new({ items: [app, ...(await submenus())] });
    await menu.setAsAppMenu();
}

/** Window position for a CSS pixel point. Wayland won't report the pointer, so menus need one. */
function at(x: number, y: number) {
    return new PhysicalPosition(Math.round(x * devicePixelRatio), Math.round(y * devicePixelRatio));
}

export async function popupHamburger(x: number, y: number) {
    const menu = await Menu.new({ items: await submenus() });
    await menu.popup(at(x, y));
}

export async function popupContextMenu(x: number, y: number) {
    const newTabProfiles = await newTabProfileItems();
    const menu = await Menu.new({
        items: [
            await item("New Tab", "tab:new", false),
            ...(newTabProfiles.length > 0
                ? [await Submenu.new({ text: "New Tab with Profile", items: newTabProfiles })]
                : []),
            await separator(),
            await item("Split Right", "pane:splitRight", false),
            await item("Split Down", "pane:splitDown", false),
            await item("Close Pane", "pane:close", false),
            await separator(),
            await item("Copy", "editor:copy", false),
            await item("Paste", "editor:paste", false),
            await item("Select All", "editor:selectAll", false),
            await separator(),
            await item("Clear Buffer", "editor:clearBuffer", false),
            await item("Find", "editor:search", false),
            await separator(),
            await item("Settings…", "window:preferences", false),
        ],
    });
    await menu.popup(at(x, y));
}

/** Right-click on the title bar: settings and the webview inspector. */
export async function popupTitleMenu(x: number, y: number) {
    const menu = await Menu.new({
        items: [
            await item("Open Settings", "window:preferences", false),
            await item("Open Keybindings", "window:keybindings", false),
            await item("Change Theme…", "window:themes", false),
            await separator(),
            await item("Inspect Element", "window:devtools", false),
        ],
    });
    await menu.popup(at(x, y));
}
