import { invoke } from "@tauri-apps/api/core";
import type { IBufferLine, ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { isMac } from "../config/keymaps";

/** Runs of characters that can make up a path. */
const TOKEN = /[^\s"'`<>|()[\]{}]+/g;
/** A trailing `:line` or `:line:col`, as compilers and grep print. */
const LINE_SUFFIX = /(:\d+){1,2}$/;
const TRAILING = /[.,;:!?]+$/;

/** Cmd+Click on macOS, Ctrl+Click elsewhere, like VS Code. */
const modifierHeld = (e: MouseEvent) => (isMac ? e.metaKey : e.ctrlKey);

/** A path-looking token: has a separator, or is a name with an extension. */
function candidate(token: string): string | undefined {
    if (token.includes("://")) return undefined;
    const path = token.replace(TRAILING, "").replace(LINE_SUFFIX, "");
    if (!path || path === "." || path === "..") return undefined;
    if (/[\\/]/.test(path) || path === "~" || /^[\w.-]*\w\.\w+$/.test(path)) return path;
    return undefined;
}

/** The line's text, and the cell column each character starts at. */
function lineText(line: IBufferLine, cols: number) {
    let text = "";
    const columns: number[] = [];
    for (let x = 0; x < cols; x++) {
        const chars = line.getCell(x)?.getChars() ?? "";
        // The second cell of a wide character is empty.
        if (!chars && line.getCell(x)?.getWidth() === 0) continue;
        for (let i = 0; i < (chars || " ").length; i++) columns.push(x);
        text += chars || " ";
    }
    return { text, columns };
}

/**
 * Makes paths printed in the terminal clickable with Cmd/Ctrl+Click: files
 * open in a code editor and folders in the file manager (see `open_path`).
 * Relative paths resolve against the shell's current directory, and only
 * paths that exist become links.
 */
export function fileLinkProvider(
    term: Terminal,
    cwd: () => Promise<string | undefined>,
    onError: (message: string) => void,
): ILinkProvider {
    return {
        provideLinks(y, callback) {
            const line = term.buffer.active.getLine(y - 1);
            if (!line) return callback(undefined);
            const { text, columns } = lineText(line, term.cols);
            const found: { path: string; start: number; end: number }[] = [];
            for (const m of text.matchAll(TOKEN)) {
                const path = candidate(m[0]);
                if (!path) continue;
                const start = m.index + m[0].indexOf(path);
                const shown = m[0].replace(TRAILING, "");
                found.push({ path, start, end: m.index + shown.length - 1 });
            }
            if (!found.length) return callback(undefined);

            void cwd()
                .then((dir) =>
                    invoke<(string | null)[]>("path_links", {
                        cwd: dir ?? null,
                        paths: found.map((f) => f.path),
                    }),
                )
                .then((resolved) => {
                    const links: ILink[] = [];
                    found.forEach((f, i) => {
                        const target = resolved[i];
                        if (!target) return;
                        links.push({
                            range: {
                                start: { x: columns[f.start] + 1, y },
                                end: { x: columns[f.end] + 1, y },
                            },
                            text: target,
                            activate(event) {
                                if (!modifierHeld(event)) return;
                                invoke("open_path", { path: target }).catch((e) =>
                                    onError(String(e)),
                                );
                            },
                        });
                    });
                    callback(links.length ? links : undefined);
                })
                .catch(() => callback(undefined));
        },
    };
}
