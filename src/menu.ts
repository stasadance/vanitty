import { Menu, MenuItem, PredefinedMenuItem, Submenu, type MenuItemOptions } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { runCommand } from "./commands";
import { isMac, keyFor } from "./config/keymaps";
import { getState } from "./store";

/** Tauri accelerator syntax from our "ctrl+shift+t" form. */
function accelerator(key: string | undefined) {
  if (!key) return undefined;
  const parts = key.split("+").map((p) => {
    switch (p) {
      case "meta":
        return "Cmd";
      case "ctrl":
        return "Ctrl";
      case "alt":
        return "Alt";
      case "shift":
        return "Shift";
      case "esc":
        return "Escape";
      case "left":
      case "right":
      case "up":
      case "down":
        return `Arrow${p[0].toUpperCase()}${p.slice(1)}`;
      default:
        return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
    }
  });
  return parts.join("+");
}

/**
 * On macOS the app menu owns its shortcuts, so items carry accelerators.
 * Elsewhere menus are popups and shortcuts are handled in the webview, so
 * they're left off to avoid running a command twice.
 */
async function item(text: string, command: string, withAccel = isMac) {
  const opts: MenuItemOptions = { text, action: () => void runCommand(command) };
  if (withAccel) {
    const accel = accelerator(keyFor(getState().keymap, command));
    if (accel) opts.accelerator = accel;
  }
  return MenuItem.new(opts);
}

const sep = () => PredefinedMenuItem.new({ item: "Separator" });

async function profileItems(command: string) {
  const { profiles } = getState().config;
  if (profiles.length < 2) return [];
  return Promise.all(profiles.map((p) => item(p.name, `${command}:${p.name}`, false)));
}

async function submenus(): Promise<Submenu[]> {
  const newTabProfiles = await profileItems("tab:new");
  const shell = await Submenu.new({
    text: "Shell",
    items: [
      await item("New Tab", "tab:new"),
      await item("New Window", "window:new"),
      ...(newTabProfiles.length ? [await Submenu.new({ text: "New Tab with Profile", items: newTabProfiles })] : []),
      await sep(),
      await item("Split Right", "pane:splitRight"),
      await item("Split Down", "pane:splitDown"),
      await sep(),
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
      await sep(),
      await item("Find", "editor:search"),
      await item("Clear Buffer", "editor:clearBuffer"),
      ...(isMac ? [] : [await sep(), await item("Preferences…", "window:preferences")]),
    ],
  });
  const view = await Submenu.new({
    text: "View",
    items: [
      await item("Reload Config", "window:reload"),
      await item("Full Reload", "window:reloadFull"),
      await item("Developer Tools", "window:devtools"),
      await sep(),
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
      await sep(),
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
      await sep(),
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
      await sep(),
      await item("Settings…", "window:preferences"),
      await sep(),
      await PredefinedMenuItem.new({ item: "Hide" }),
      await PredefinedMenuItem.new({ item: "HideOthers" }),
      await PredefinedMenuItem.new({ item: "ShowAll" }),
      await sep(),
      await item("Quit Vanitty", "app:quit"),
    ],
  });
  const menu = await Menu.new({ items: [app, ...(await submenus())] });
  await menu.setAsAppMenu();
}

export async function popupHamburger(x: number, y: number) {
  const menu = await Menu.new({ items: await submenus() });
  await menu.popup(new LogicalPosition(x, y));
}

export async function popupContextMenu() {
  const newTabProfiles = await profileItems("tab:new");
  const menu = await Menu.new({
    items: [
      await item("New Tab", "tab:new", false),
      ...(newTabProfiles.length ? [await Submenu.new({ text: "New Tab with Profile", items: newTabProfiles })] : []),
      await sep(),
      await item("Split Right", "pane:splitRight", false),
      await item("Split Down", "pane:splitDown", false),
      await item("Close Pane", "pane:close", false),
      await sep(),
      await item("Copy", "editor:copy", false),
      await item("Paste", "editor:paste", false),
      await item("Select All", "editor:selectAll", false),
      await sep(),
      await item("Clear Buffer", "editor:clearBuffer", false),
      await item("Find", "editor:search", false),
      await sep(),
      await item("Settings…", "window:preferences", false),
    ],
  });
  await menu.popup();
}
