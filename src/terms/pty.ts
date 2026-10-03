import { Channel, invoke } from "@tauri-apps/api/core";

export interface SpawnOptions {
    cols: number;
    rows: number;
    shell?: string;
    shellArgs?: string[];
    cwd?: string;
    env?: Record<string, string>;
}

export interface Spawned {
    id: number;
    pid: number | null;
    shell: string;
}

export interface Exited {
    code: number;
    elapsedMs: number;
}

export function spawnPty(
    options: SpawnOptions,
    onData: (data: Uint8Array) => void,
    onExit: (e: Exited) => void,
): Promise<Spawned> {
    const output = new Channel<ArrayBuffer>();
    output.onmessage = (buf) => onData(new Uint8Array(buf));
    const exit = new Channel<Exited>();
    exit.onmessage = onExit;
    return invoke<Spawned>("pty_spawn", { options, output, exit });
}

export const writePty = (id: number, data: string) => invoke("pty_write", { id, data });
export const resizePty = (id: number, cols: number, rows: number) =>
    invoke("pty_resize", { id, cols, rows });
export const killPty = (id: number) => invoke("pty_kill", { id });
export const ptyCwd = (id: number) => invoke<string | null>("pty_cwd", { id });
export const defaultShell = () => invoke<string>("pty_default_shell");
