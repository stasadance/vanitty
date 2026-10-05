import { invoke } from "@tauri-apps/api/core";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ClipboardAddon, type IClipboardProvider } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { type ISearchOptions, SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { type IDisposable, type ITerminalOptions, Terminal } from "@xterm/xterm";
import Color from "color";

import { DEFAULT_BELL } from "./bell";
import { fileLinkProvider } from "./file-links";
import {
    type Exited,
    killPty,
    ptyCwd,
    resizePty,
    type SpawnOptions,
    spawnPty,
    writePty,
} from "./pty";

import { platform, uiScale } from "../config/keymaps";
import { orElse } from "../helpers";
import { notify } from "../store";

import type { TermConfig } from "../config/defaults";

/** OSC 52 copy (tmux, vim, ssh). Reads get nothing; the Linux primary selection is skipped. */
const osc52: IClipboardProvider = {
    readText: () => "",
    writeText: (selection, text) => {
        if (selection !== "p") return writeText(text);
    },
};

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
    const isTransparent = alpha(c.backgroundColor) < 1;
    return {
        macOptionIsMeta: c.modifierKeys?.altIsMeta ?? false,
        macOptionClickForcesSelection: c.macOptionSelectionMode === "force",
        scrollback: c.scrollback,
        cursorStyle: CURSOR_STYLES[c.cursorShape] ?? "block",
        cursorBlink: c.cursorBlink,
        fontFamily: c.fontFamily,
        fontSize: fontSize * uiScale,
        fontWeight: c.fontWeight as ITerminalOptions["fontWeight"],
        fontWeightBold: c.fontWeightBold as ITerminalOptions["fontWeightBold"],
        lineHeight: c.lineHeight,
        letterSpacing: c.letterSpacing * uiScale,
        allowTransparency: isTransparent,
        screenReaderMode: c.screenReaderMode,
        windowsPty: platform === "windows" ? { backend: "conpty" } : undefined,
        overviewRuler: { width: 10 * uiScale },
        allowProposedApi: true,
        theme: {
            foreground: c.foregroundColor,
            background: isTransparent ? "rgba(0,0,0,0)" : c.backgroundColor,
            cursor: c.cursorColor,
            cursorAccent: c.cursorAccentColor,
            selectionBackground: c.selectionColor,
            overviewRulerBorder: isTransparent ? "rgba(0,0,0,0)" : c.backgroundColor,
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

/** A terminal and its shell, outside React so it survives pane remounts. */
export class TermSession {
    private fit = new FitAddon();
    private search = new SearchAddon();
    private serializer = new SerializeAddon();
    private webgl?: WebglAddon;
    private ligatures?: LigaturesAddon;
    private image?: ImageAddon;
    private disposables: IDisposable[] = [];
    private bell: HTMLAudioElement | null = null;
    private opened = false;
    private exited = false;
    private resizeTimer?: ReturnType<typeof setTimeout>;
    readonly term: Terminal;
    readonly element: HTMLDivElement;
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
        /** Screen text from the last run, shown above the new shell. */
        private restored?: string,
    ) {
        this.config = config;
        this.fontSize = fontSize;
        this.term = new Terminal(termOptions(config, fontSize));
        this.term.loadAddon(this.serializer);
        this.element = document.createElement("div");
        this.element.className = "term_fit term_term";
        this.setBell(config);
    }

    private open() {
        const { term } = this;
        term.loadAddon(this.fit);
        term.loadAddon(this.search);
        term.loadAddon(new ClipboardAddon(undefined, osc52));
        term.loadAddon(
            new WebLinksAddon((event, uri) => {
                const key = this.config.webLinksActivationKey;
                if (!key || event[`${key}Key` as "ctrlKey"]) void invoke("open_url", { url: uri });
            }),
        );
        this.disposables.push(
            term.registerLinkProvider(
                fileLinkProvider(
                    term,
                    () => this.cwd(),
                    (error) => notify(error, true),
                ),
            ),
        );
        term.open(this.element);
        term.loadAddon(new Unicode11Addon());
        term.unicode.activeVersion = "11";
        this.applyLigatures();
        this.applyRenderer();
        this.applyImages();
        this.applyPadding();
        this.fit.fit();
        if (this.restored) {
            term.write(this.restored + "\r\n");
            this.restored = undefined;
        }

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
                if (this.config.copyOnSelect && term.hasSelection())
                    void writeText(term.getSelection());
            }),
            this.search.onDidChangeResults((r) => this.events.onSearchResults(r)),
        );
        term.textarea?.addEventListener("focus", () => this.events.onFocus());
        this.element.addEventListener("mouseup", (event) => this.onMouseUp(event));

        void this.start(this.spawn);
    }

    private async start(options: Omit<SpawnOptions, "cols" | "rows">, isFallback = false) {
        let started: Awaited<ReturnType<typeof spawnPty>>;
        try {
            started = await spawnPty(
                { ...options, cols: this.term.cols, rows: this.term.rows },
                (data) => {
                    this.term.write(data);
                    this.events.onData(data);
                },
                (exited) => this.onPtyExit(exited, options, isFallback),
            );
        } catch (error) {
            this.term.write(`\r\nCouldn't start the shell: ${error}\r\n`);
            return;
        }
        if (this.exited) {
            void killPty(started.id);
            return;
        }
        this.ptyId = started.id;
        this.pid = started.pid;
        this.onSpawned(started.shell, started.id);
    }

    private onPtyExit(
        exited: Exited,
        options: Omit<SpawnOptions, "cols" | "rows">,
        isFallback: boolean,
    ) {
        if (this.exited) return;
        // A shell that dies at once is likely misconfigured: say so, use the default.
        if (
            !isFallback &&
            exited.code > 0 &&
            exited.elapsedMs < 1000 &&
            (options.shell || options.shellArgs?.length)
        ) {
            const message =
                `\nShell exited in ${exited.elapsedMs} ms with exit code ${exited.code}.\n` +
                `Check your shell settings: ${JSON.stringify({ shell: options.shell, shellArgs: options.shellArgs })}\n` +
                `Using the default shell instead.\n\n`;
            this.term.write(message.replaceAll("\n", "\r\n"));
            this.ptyId = undefined;
            void this.start({ ...options, shell: undefined, shellArgs: undefined }, true);
            return;
        }
        this.exited = true;
        this.events.onExit();
    }

    /** Padding goes on xterm's own element so the fit addon accounts for it. */
    private applyPadding() {
        if (!this.term.element) return;
        this.term.element.style.padding = this.config.padding.replaceAll(
            /(\d*\.?\d+)px/g,
            (_, n: string) => `${Number(n) * uiScale}px`,
        );
    }

    /** Must run before the WebGL addon loads so its atlas gets the font features. */
    private applyLigatures() {
        if (!this.config.disableLigatures && !this.ligatures) {
            try {
                this.ligatures = new LigaturesAddon();
                this.term.loadAddon(this.ligatures);
            } catch {
                this.ligatures = undefined;
            }
        } else if (this.config.disableLigatures && this.ligatures) {
            this.ligatures.dispose();
            this.ligatures = undefined;
        }
    }

    private applyRenderer() {
        const isWant = this.config.webGLRenderer && alpha(this.config.backgroundColor) >= 1;
        if (isWant && !this.webgl) {
            try {
                // Else WebKitGTK draws WebGL a frame late and typing lags.
                const webgl = new WebglAddon(platform === "linux");
                webgl.onContextLoss(() => {
                    webgl.dispose();
                    this.webgl = undefined;
                });
                this.term.loadAddon(webgl);
                this.webgl = webgl;
            } catch {
                this.webgl = undefined;
            }
        } else if (!isWant && this.webgl) {
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
            c.bell && c.bell.toUpperCase() === "SOUND"
                ? new Audio(c.bellSoundURL || c.bellSound || DEFAULT_BELL)
                : null;
    }

    private onMouseUp(event: MouseEvent) {
        if (this.config.quickEdit && event.button === 2) {
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

    /** Moves the terminal into `container`, opening it on first use. */
    attach(container: HTMLElement) {
        if (this.element.parentElement !== container) container.append(this.element);
        if (this.opened) {
            this.fitNow();
        } else {
            this.opened = true;
            this.open();
        }
    }

    /** Screen and scrollback text, without what full-screen programs drew. */
    snapshot(): string {
        return this.opened
            ? this.serializer.serialize({ excludeAltBuffer: true, excludeModes: true })
            : (this.restored ?? "");
    }

    /** The shell's current directory, else the one it started in. */
    async cwd(): Promise<string | undefined> {
        const live = this.ptyId === undefined ? null : await orElse(ptyCwd(this.ptyId), null);
        return live || this.spawn.cwd || undefined;
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
        if (
            !this.opened ||
            !this.element.isConnected ||
            this.element.clientWidth === 0 ||
            this.element.clientHeight === 0
        )
            return;
        try {
            this.fit.fit();
        } catch {
            // Not laid out yet.
        }
    }

    update(config: TermConfig, fontSize: number) {
        const previous = this.config;
        const previousFont = this.fontSize;
        this.config = config;
        this.fontSize = fontSize;
        const next = termOptions(config, fontSize);
        const current = termOptions(previous, previousFont);
        for (const [k, v] of Object.entries(next)) {
            const key = k as keyof ITerminalOptions;
            if (JSON.stringify(current[key]) !== JSON.stringify(v)) {
                (this.term.options as Record<string, unknown>)[key] = v;
            }
        }
        this.applyPadding();
        if (previous.bell !== config.bell || previous.bellSoundURL !== config.bellSoundURL)
            this.setBell(config);
        if (previous.disableLigatures !== config.disableLigatures) {
            // WebGL bakes font features into its glyph atlas, so reload it after.
            this.webgl?.dispose();
            this.webgl = undefined;
            this.applyLigatures();
            this.applyRenderer();
        } else if (
            previous.webGLRenderer !== config.webGLRenderer ||
            alpha(previous.backgroundColor) !== alpha(config.backgroundColor)
        ) {
            this.applyRenderer();
        }
        if (previous.imageSupport !== config.imageSupport) this.applyImages();
        this.fitNow();
    }

    searchFind(term: string, flags: SearchFlags, isBackwards: boolean) {
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
        if (isBackwards) this.search.findPrevious(term, options);
        else this.search.findNext(term, options);
    }

    searchClear() {
        this.search.clearDecorations();
        this.search.clearActiveDecoration();
    }

    /** Ends the shell; `onExit` fires once it is gone. */
    kill() {
        if (this.ptyId === undefined) {
            this.exited = true;
            this.events.onExit();
        } else {
            void killPty(this.ptyId);
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
