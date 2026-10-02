import { Terminal, type ITerminalOptions, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { ImageAddon } from "@xterm/addon-image";
import { WebglAddon } from "@xterm/addon-webgl";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import Color from "color";
import type { TermConfig } from "../config/defaults";
import { platform } from "../config/keymaps";
import { DEFAULT_BELL } from "./bell";
import { killPty, resizePty, spawnPty, writePty, type Exited, type SpawnOptions } from "./pty";

const CURSOR_STYLES = { BEAM: "bar", UNDERLINE: "underline", BLOCK: "block" } as const;

function alpha(color: string): number {
  try {
    return Color(color).alpha();
  } catch {
    return 1;
  }
}

function hex(color: string, fallback = "#ff00ff"): string {
  try {
    return Color(color).hex();
  } catch {
    return fallback;
  }
}

export function termOptions(c: TermConfig, fontSize: number): ITerminalOptions {
  const transparent = alpha(c.backgroundColor) < 1;
  return {
    macOptionIsMeta: c.modifierKeys?.altIsMeta ?? false,
    macOptionClickForcesSelection: c.macOptionSelectionMode === "force",
    scrollback: c.scrollback,
    cursorStyle: CURSOR_STYLES[c.cursorShape] ?? "block",
    cursorBlink: c.cursorBlink,
    fontFamily: c.fontFamily,
    fontSize,
    fontWeight: c.fontWeight as ITerminalOptions["fontWeight"],
    fontWeightBold: c.fontWeightBold as ITerminalOptions["fontWeightBold"],
    lineHeight: c.lineHeight,
    letterSpacing: c.letterSpacing,
    allowTransparency: transparent,
    screenReaderMode: c.screenReaderMode,
    windowsPty: platform === "windows" ? { backend: "conpty" } : undefined,
    overviewRuler: { width: 20 },
    allowProposedApi: true,
    theme: {
      foreground: c.foregroundColor,
      background: transparent ? "rgba(0,0,0,0)" : c.backgroundColor,
      cursor: c.cursorColor,
      cursorAccent: c.cursorAccentColor,
      selectionBackground: c.selectionColor,
      overviewRulerBorder: transparent ? "rgba(0,0,0,0)" : c.backgroundColor,
      black: c.colors.black,
      red: c.colors.red,
      green: c.colors.green,
      yellow: c.colors.yellow,
      blue: c.colors.blue,
      magenta: c.colors.magenta,
      cyan: c.colors.cyan,
      white: c.colors.white,
      brightBlack: c.colors.lightBlack,
      brightRed: c.colors.lightRed,
      brightGreen: c.colors.lightGreen,
      brightYellow: c.colors.lightYellow,
      brightBlue: c.colors.lightBlue,
      brightMagenta: c.colors.lightMagenta,
      brightCyan: c.colors.lightCyan,
      brightWhite: c.colors.lightWhite,
    },
  };
}

export interface SessionEvents {
  onTitle(title: string): void;
  onData(data: Uint8Array): void;
  onInput(data: string): void;
  onExit(): void;
  onFocus(): void;
  onSearchResults(results: { resultIndex: number; resultCount: number } | undefined): void;
}

export interface SearchFlags {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

/**
 * One terminal and its shell. Lives outside React so it survives the
 * remounts that happen when panes are split or closed.
 */
export class TermSession {
  readonly term: Terminal;
  readonly element: HTMLDivElement;
  private fit = new FitAddon();
  private search = new SearchAddon();
  private webgl?: WebglAddon;
  private image?: ImageAddon;
  private disposables: IDisposable[] = [];
  private bell: HTMLAudioElement | null = null;
  private opened = false;
  private exited = false;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  ptyId?: number;
  pid?: number | null;
  config: TermConfig;
  fontSize: number;

  constructor(
    readonly uid: string,
    config: TermConfig,
    fontSize: number,
    private spawn: Omit<SpawnOptions, "cols" | "rows">,
    private events: SessionEvents,
    private onSpawned: (shell: string, ptyId: number) => void,
  ) {
    this.config = config;
    this.fontSize = fontSize;
    this.term = new Terminal(termOptions(config, fontSize));
    this.element = document.createElement("div");
    this.element.className = "term_fit term_term";
    this.setBell(config);
  }

  /** Moves the terminal into `container`, opening it on first use. */
  attach(container: HTMLElement) {
    if (this.element.parentElement !== container) container.appendChild(this.element);
    if (!this.opened) {
      this.opened = true;
      this.open();
    } else {
      this.fitNow();
    }
  }

  private open() {
    const { term } = this;
    term.loadAddon(this.fit);
    term.loadAddon(this.search);
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        const key = this.config.webLinksActivationKey;
        if (!key || event[`${key}Key` as "ctrlKey"]) void openUrl(uri);
      }),
    );
    term.open(this.element);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";
    this.applyRenderer();
    this.applyImages();
    this.applyPadding();
    this.fit.fit();

    this.disposables.push(
      term.onTitleChange((t) => this.events.onTitle(t)),
      term.onBell(() => void this.bell?.play().catch(() => {})),
      term.onData((data) => {
        this.write(data);
        this.events.onInput(data);
      }),
      term.onResize(({ cols, rows }) => {
        if (this.ptyId !== undefined) void resizePty(this.ptyId, cols, rows);
      }),
      term.onSelectionChange(() => {
        if (this.config.copyOnSelect && term.hasSelection()) void writeText(term.getSelection());
      }),
      this.search.onDidChangeResults((r) => this.events.onSearchResults(r)),
    );
    term.textarea?.addEventListener("focus", () => this.events.onFocus());
    this.element.addEventListener("mouseup", (e) => this.onMouseUp(e));

    void this.start(this.spawn);
  }

  private async start(options: Omit<SpawnOptions, "cols" | "rows">, fallback = false) {
    const started = await spawnPty(
      { ...options, cols: this.term.cols, rows: this.term.rows },
      (data) => {
        this.term.write(data);
        this.events.onData(data);
      },
      (e) => this.onPtyExit(e, options, fallback),
    ).catch((err) => {
      this.term.write(`\r\nCouldn't start the shell: ${err}\r\n`);
      return undefined;
    });
    if (!started) return;
    if (this.exited) {
      void killPty(started.id);
      return;
    }
    this.ptyId = started.id;
    this.pid = started.pid;
    this.onSpawned(started.shell, started.id);
  }

  private onPtyExit(e: Exited, options: Omit<SpawnOptions, "cols" | "rows">, fallback: boolean) {
    if (this.exited) return;
    // A shell that fails right away usually means a broken shell setting, so
    // say why and fall back to the default shell instead of closing.
    if (e.code > 0 && e.elapsedMs < 1000 && !fallback && (options.shell || options.shellArgs?.length)) {
      const msg =
        `\nShell exited in ${e.elapsedMs} ms with exit code ${e.code}.\n` +
        `Check your shell settings: ${JSON.stringify({ shell: options.shell, shellArgs: options.shellArgs })}\n` +
        `Using the default shell instead.\n\n`;
      this.term.write(msg.replace(/\n/g, "\r\n"));
      this.ptyId = undefined;
      void this.start({ ...options, shell: undefined, shellArgs: undefined }, true);
      return;
    }
    this.exited = true;
    this.events.onExit();
  }

  write(data: string) {
    if (this.ptyId !== undefined) void writePty(this.ptyId, data);
  }

  paste(text: string) {
    this.term.paste(text);
  }

  focus() {
    this.term.focus();
  }

  /** Fits after layout settles; resizes come in bursts while dragging. */
  scheduleFit() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.fitNow(), 30);
  }

  fitNow() {
    if (!this.opened || !this.element.isConnected) return;
    if (this.element.clientWidth === 0 || this.element.clientHeight === 0) return;
    try {
      this.fit.fit();
    } catch {
      // Not laid out yet.
    }
  }

  update(config: TermConfig, fontSize: number) {
    const prev = this.config;
    const prevFont = this.fontSize;
    this.config = config;
    this.fontSize = fontSize;
    const next = termOptions(config, fontSize);
    const current = termOptions(prev, prevFont);
    for (const [k, v] of Object.entries(next)) {
      const key = k as keyof ITerminalOptions;
      if (JSON.stringify(current[key]) !== JSON.stringify(v)) {
        (this.term.options as Record<string, unknown>)[key] = v;
      }
    }
    this.applyPadding();
    if (prev.bell !== config.bell || prev.bellSoundURL !== config.bellSoundURL) this.setBell(config);
    if (prev.webGLRenderer !== config.webGLRenderer || alpha(prev.backgroundColor) !== alpha(config.backgroundColor)) {
      this.applyRenderer();
    }
    if (prev.imageSupport !== config.imageSupport) this.applyImages();
    this.fitNow();
  }

  /** Padding goes on xterm's own element so the fit addon accounts for it. */
  private applyPadding() {
    if (this.term.element) this.term.element.style.padding = this.config.padding;
  }

  private applyRenderer() {
    const want = this.config.webGLRenderer && alpha(this.config.backgroundColor) >= 1;
    if (want && !this.webgl) {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          webgl.dispose();
          this.webgl = undefined;
        });
        this.term.loadAddon(webgl);
        this.webgl = webgl;
      } catch {
        this.webgl = undefined;
      }
    } else if (!want && this.webgl) {
      this.webgl.dispose();
      this.webgl = undefined;
    }
  }

  private applyImages() {
    if (this.config.imageSupport && !this.image) {
      this.image = new ImageAddon();
      this.term.loadAddon(this.image);
    } else if (!this.config.imageSupport && this.image) {
      this.image.dispose();
      this.image = undefined;
    }
  }

  private setBell(c: TermConfig) {
    this.bell =
      c.bell && String(c.bell).toUpperCase() === "SOUND"
        ? new Audio(c.bellSoundURL || c.bellSound || DEFAULT_BELL)
        : null;
  }

  private onMouseUp(e: MouseEvent) {
    if (this.config.quickEdit && e.button === 2) {
      if (this.term.hasSelection()) {
        void writeText(this.term.getSelection());
        this.term.clearSelection();
      } else {
        void readText()
          .catch(() => "")
          .then((text) => text && this.paste(text));
      }
    }
  }

  searchFind(term: string, flags: SearchFlags, backwards: boolean) {
    const options: ISearchOptions = {
      ...flags,
      decorations: {
        activeMatchColorOverviewRuler: hex(this.config.cursorColor),
        matchOverviewRuler: hex(this.config.borderColor, "#333333"),
        activeMatchBackground: hex(this.config.cursorColor),
        activeMatchBorder: hex(this.config.cursorColor),
        matchBorder: hex(this.config.cursorColor),
      },
    };
    if (backwards) this.search.findPrevious(term, options);
    else this.search.findNext(term, options);
  }

  searchClear() {
    this.search.clearDecorations();
    this.search.clearActiveDecoration();
  }

  /** Ends the shell; `onExit` fires once it is gone. */
  kill() {
    if (this.ptyId !== undefined) void killPty(this.ptyId);
    else {
      this.exited = true;
      this.events.onExit();
    }
  }

  dispose() {
    this.exited = true;
    clearTimeout(this.resizeTimer);
    if (this.ptyId !== undefined) void killPty(this.ptyId);
    for (const d of this.disposables) d.dispose();
    this.term.dispose();
    this.element.remove();
  }
}

