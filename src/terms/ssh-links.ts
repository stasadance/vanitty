import { invoke } from "@tauri-apps/api/core";

import { isModifierHeld, lineText } from "./file-links";

import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

/** Checked by Rust, which shows nothing it can't run safely. */
export interface SshLink {
    destination: string;
    port: number | null;
    program: string;
    args: string[];
}

const SSH_URL = /ssh:\/\/[^\s"'`<>|()[\]{}]+/gi;
const TRAILING = /[.,;:!?]+$/;

/** Cmd/Ctrl+Click on `ssh://` links asks before connecting. */
export function sshLinkProvider(
    term: Terminal,
    onLink: (link: SshLink) => void,
    onError: (message: string) => void,
): ILinkProvider {
    return {
        provideLinks(y, callback) {
            const line = term.buffer.active.getLine(y - 1);
            if (!line) return callback(undefined);
            const { text, columns } = lineText(line, term.cols);
            const links: ILink[] = [];
            for (const m of text.matchAll(SSH_URL)) {
                if (/[\w.+-]/.test(text[m.index - 1] ?? "")) continue;
                const url = m[0].replace(TRAILING, "");
                links.push({
                    range: {
                        start: { x: columns[m.index] + 1, y },
                        end: { x: columns[m.index + url.length - 1] + 1, y },
                    },
                    text: url,
                    activate(event) {
                        if (!isModifierHeld(event)) return;
                        void invoke<SshLink>("ssh_link", { url })
                            .then(onLink)
                            .catch((error: unknown) => onError(String(error)));
                    },
                });
            }
            callback(links.length > 0 ? links : undefined);
        },
    };
}
