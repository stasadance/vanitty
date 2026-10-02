// Messages between the plugin host (window) and a plugin worker.

export type HostToWorker =
  | { t: "activate"; name: string; entry: string; sources: Record<string, string>; platform: string }
  | { t: "result"; id: number; value?: unknown; error?: string }
  | { t: "event"; name: string; payload: unknown }
  | { t: "invoke"; id: number; command: string; arg?: string }
  | { t: "deactivate" };

export type WorkerToHost =
  | { t: "ready" }
  | { t: "failed"; error: string }
  | { t: "call"; id: number; method: string; args: unknown[] }
  | { t: "result"; id: number; value?: unknown; error?: string }
  | { t: "deactivated" };

export const EVENTS = [
  "terminal.open",
  "terminal.close",
  "terminal.active",
  "terminal.title",
  "terminal.data",
  "terminal.input",
  "config",
] as const;
