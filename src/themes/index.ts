import { invoke } from "@tauri-apps/api/core";
import { platform } from "../config/keymaps";

export interface ThemeResult<T> {
  config: T;
  errors: string[];
}

export interface InstallResult {
  name: string;
  error: string | null;
}

const TIMEOUT_MS = 5000;

/** Package name without a version, matching the folder it installs to. */
export function themeName(spec: string): string {
  const s = spec.trim().split("#")[0];
  const at = s.indexOf("@", s.startsWith("@") ? 1 : 0);
  return at > 0 ? s.slice(0, at) : s;
}

export async function installThemes(specs: string[], force = false): Promise<string[]> {
  if (!specs.length) return [];
  const results = await invoke<InstallResult[]>("packages_install", { kind: "themes", specs, force });
  return results.filter((r) => r.error).map((r) => `Couldn't install theme ${r.name}: ${r.error}`);
}

/** Runs each theme's `decorateConfig` over the config, in order. */
export async function applyThemes<T extends object>(
  specs: string[],
  config: T,
): Promise<ThemeResult<T>> {
  if (!specs.length) return { config, errors: [] };
  const errors = await installThemes(specs);
  const sources = await invoke<Record<string, string>>("packages_sources", { kind: "themes" });
  return runWorker({ sources, themes: specs.map(themeName), config }, config, errors);
}

/** Evaluates a CommonJS module (a legacy .hyper.js) in the sandbox. */
export async function evalModule(source: string): Promise<ThemeResult<Record<string, unknown>>> {
  return runWorker({ sources: {}, themes: [], config: {}, module: source }, {}, []);
}

async function runWorker<T>(
  message: Record<string, unknown>,
  config: T,
  errors: string[],
): Promise<ThemeResult<T>> {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  try {
    const result = await new Promise<ThemeResult<T>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Themes took too long to load.")), TIMEOUT_MS);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        resolve(e.data);
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(e.message));
      };
      worker.postMessage({ ...message, platform });
    });
    return { config: result.config, errors: [...errors, ...result.errors] };
  } catch (err) {
    return { config, errors: [...errors, String(err)] };
  } finally {
    worker.terminate();
  }
}

/** Splits Hyper plugin names into themes (have decorateConfig) and the rest. */
export async function classifyPlugins(specs: string[]): Promise<{ themes: string[]; other: string[]; errors: string[] }> {
  const errors = await installThemes(specs);
  const sources = await invoke<Record<string, string>>("packages_sources", { kind: "themes" });
  const themes: string[] = [];
  const other: string[] = [];
  for (const spec of specs) {
    const r = await runWorker({ sources, themes: [themeName(spec)], config: {} }, {}, []);
    if (r.errors.length) other.push(spec);
    else themes.push(spec);
  }
  return { themes, other, errors };
}
