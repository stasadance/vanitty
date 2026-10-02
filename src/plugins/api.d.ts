/**
 * The API a Vanitty plugin receives in `activate(vanitty)`.
 *
 * Plugins run in a sandboxed Web Worker: no DOM, no network, no direct access
 * to the app. Everything goes through this object.
 */
export interface Disposable {
  dispose(): void;
}

export interface TerminalInfo {
  /** Stable id for the terminal's lifetime. */
  id: string;
  title: string;
  profile: string;
  active: boolean;
}

export interface HeaderItem {
  text: string;
  tooltip?: string;
  /** Command to run when the item is clicked. */
  command?: string;
}

export interface VanittyAPI {
  /** Name of this plugin, as listed in settings. */
  readonly pluginName: string;
  readonly platform: "macos" | "linux" | "windows";

  commands: {
    /**
     * Adds a command that keybindings and other plugins can run. Ids without
     * a namespace are prefixed with the plugin name, e.g. "my-plugin:hello".
     */
    register(id: string, handler: (arg?: string) => unknown): Disposable;
    /** Runs any command, e.g. "tab:new" or "pane:splitRight". */
    execute(id: string, arg?: string): Promise<void>;
  };

  terminals: {
    list(): Promise<TerminalInfo[]>;
    active(): Promise<TerminalInfo | undefined>;
    /** Sends text to a terminal's shell, as if typed. Defaults to the active one. */
    write(text: string, id?: string): Promise<void>;
    onDidOpen(cb: (t: TerminalInfo) => void): Disposable;
    onDidClose(cb: (id: string) => void): Disposable;
    onDidChangeActive(cb: (id: string) => void): Disposable;
    onDidChangeTitle(cb: (e: { id: string; title: string }) => void): Disposable;
    /** Output from the shell. */
    onData(cb: (e: { id: string; data: string }) => void): Disposable;
    /** Keys the user typed. */
    onInput(cb: (e: { id: string; data: string }) => void): Disposable;
  };

  config: {
    /** The resolved settings, themes applied. */
    get(): Promise<Record<string, unknown>>;
    onDidChange(cb: (config: Record<string, unknown>) => void): Disposable;
  };

  window: {
    showNotification(text: string, options?: { error?: boolean }): void;
  };

  ui: {
    /** Shows a small text item in the title bar; pass null to remove it. */
    setHeaderItem(id: string, item: HeaderItem | null): void;
  };
}

/** A plugin's main module exports these. */
export interface VanittyPlugin {
  activate(vanitty: VanittyAPI): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
