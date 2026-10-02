import { Channel, invoke } from "@tauri-apps/api/core";

export type PtyId = number;

export function spawnPty(
  cols: number,
  rows: number,
  onData: (data: Uint8Array) => void,
  onExit: () => void,
): Promise<PtyId> {
  const output = new Channel<ArrayBuffer>();
  output.onmessage = (buf) => onData(new Uint8Array(buf));
  const exit = new Channel<null>();
  exit.onmessage = onExit;
  return invoke<PtyId>("pty_spawn", { cols, rows, output, exit });
}

export const writePty = (id: PtyId, data: string) =>
  invoke("pty_write", { id, data });

export const resizePty = (id: PtyId, cols: number, rows: number) =>
  invoke("pty_resize", { id, cols, rows });

export const killPty = (id: PtyId) => invoke("pty_kill", { id });
