import { invoke } from "@tauri-apps/api/core";
import { parse } from "jsonc-parser";

import { fromHyperKeymaps } from "./keymaps";

import { classifyPlugins, evalModule } from "../themes";

interface HyperConfigFile {
    path: string;
    kind: "json" | "js";
    contents: string;
}

interface HyperConfig {
    config?: Record<string, unknown>;
    plugins?: string[];
    localPlugins?: string[];
    keymaps?: Record<string, string | string[]>;
}

// Hyper options that do nothing here (update channels, Electron and plugin plumbing).
const DROPPED = [
    "updateChannel",
    "autoUpdatePlugins",
    "defaultSSHApp",
    "useConpty",
    "windowSize",
    "fontSmoothing",
];

export interface Imported {
    from: string;
    settings: string;
    keybindings: string;
    notes: string[];
}

/** Converts an existing hyper.json or .hyper.js into Vanitty's files. */
export async function importHyperConfig(): Promise<Imported | null> {
    const file = await invoke<HyperConfigFile | null>("hyper_config_find");
    if (!file) return null;

    let hyper: HyperConfig;
    if (file.kind === "json") {
        hyper = parse(file.contents, [], { allowTrailingComma: true }) ?? {};
    } else {
        const result = await evalModule(file.contents);
        if (result.errors.length > 0) throw new Error(result.errors[0]);
        hyper = result.config as HyperConfig;
    }

    const notes: string[] = [];
    const config: Record<string, unknown> = { ...hyper.config };
    for (const key of DROPPED) delete config[key];

    const plugins = (hyper.plugins ?? []).filter((p) => typeof p === "string");
    if (plugins.length > 0) {
        const { themes, other, errors } = await classifyPlugins(plugins);
        notes.push(...errors);
        config.themes = themes;
        if (other.length > 0) {
            notes.push(
                `Skipped Hyper plugins that aren't themes: ${other.join(", ")}. Hyper plugins don't run in Vanitty; many of them are built in.`,
            );
        }
    }
    if (hyper.localPlugins?.length) {
        notes.push(`Skipped local Hyper plugins: ${hyper.localPlugins.join(", ")}.`);
    }

    const settings =
        `// Imported from ${file.path}\n` +
        JSON.stringify({ $schema: "./settings.schema.json", ...config }, null, 2) +
        "\n";
    const bindings = fromHyperKeymaps(hyper.keymaps ?? {});
    const keybindings =
        `// Imported from your Hyper keymaps. "-command" removes that command's default keys.\n` +
        JSON.stringify(bindings, null, 2) +
        "\n";
    return { from: file.path, settings, keybindings, notes };
}
