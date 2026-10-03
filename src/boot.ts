import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { activeTerm, applyConfigToTerms, newTab } from "./actions";
import { terms } from "./terms/registry";
import { emit, syncPlugins } from "./plugins/host";
import { COMMAND_IDS, commandAllowedInInput, inInput, runCommand } from "./commands";
import { eventKey, platform } from "./config/keymaps";
import { ensureConfigFiles, loadConfig } from "./config/load";
import { installAppMenu, popupHamburger } from "./menu";
import { activeSessionUid, getState, notify, setState, useStore } from "./store";
import { startUpdateChecks } from "./updates";

let configErrors: string[] = [];

async function reloadConfig() {
  const { config, keymap, errors } = await loadConfig();
  setState({ config, keymap });
  applyConfigToTerms();
  // Show each config problem once, and drop the ones that got fixed.
  setState((s) => ({ notifications: s.notifications.filter((n) => !configErrors.includes(n.text) || errors.includes(n.text)) }));
  for (const e of errors) if (!configErrors.includes(e)) notify(e, true);
  configErrors = errors;
  await installAppMenu().catch(() => {});
  await syncPlugins({
    runCommand,
    writeToTerminal: (text, id) => (id ? terms.get(id) : activeTerm())?.write(text),
  }).catch((e) => notify(`Couldn't load plugins: ${e}`, true));
}

function onKeyDown(e: KeyboardEvent) {
  if (e.isComposing) return;
  const key = eventKey(e);
  if (!key) return;
  const command = getState().keymap.get(key);
  if (!command) return;
  if (inInput() && !commandAllowedInInput(command)) return;
  if (runCommand(command)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function quotePath(p: string) {
  if (platform === "windows") return /\s/.test(p) ? `"${p}"` : p;
  return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`;
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

let booted = false;

export async function boot() {
  if (booted) return;
  booted = true;

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("vanitty:reload-config", () => void reloadConfig());

  const notes = await ensureConfigFiles(COMMAND_IDS).catch((e) => [`Couldn't set up config files: ${e}`]);
  await reloadConfig();
  for (const n of notes) notify(n);
  startUpdateChecks();

  let timer: ReturnType<typeof setTimeout> | undefined;
  await listen<string>("config-changed", () => {
    clearTimeout(timer);
    timer = setTimeout(() => void reloadConfig(), 100);
  });

  await getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type === "drop" && e.payload.paths.length) {
      const term = activeTerm();
      term?.write(e.payload.paths.map(quotePath).join(" "));
      term?.focus();
    }
  });

  // xterm measures the font when a terminal opens, so the bundled font must
  // be ready first or cells come out the fallback font's size.
  await Promise.all(
    ["400", "700"].map((w) => document.fonts.load(`${w} 13px "FiraCode Nerd Font Mono"`).catch(() => [])),
  );
  window.addEventListener("vanitty:hamburger", () => void popupHamburger(10, 34));

  await trackWindowState();
  useStore.subscribe((s, prev) => {
    const active = activeSessionUid(s);
    if (active && active !== activeSessionUid(prev)) emit("terminal.active", active);
  });
  await newTab();
}
