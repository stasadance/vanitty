import { invoke } from "@tauri-apps/api/core";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { applyThemes } from "../themes";
import { DEFAULT_CONFIG, KEYBINDINGS_TEMPLATE, SETTINGS_TEMPLATE, type Config } from "./defaults";
import { buildKeymap, type Keybinding } from "./keymaps";
import { keybindingsSchema, SETTINGS_SCHEMA } from "./schema";
import { importHyperConfig } from "./hyper";

export const SETTINGS = "settings.json";

const THEME_COLOR_KEYS = [
    "backgroundColor",
    "foregroundColor",
    "cursorColor",
    "cursorAccentColor",
    "selectionColor",
    "borderColor",
];
export const KEYBINDINGS = "keybindings.json";

export interface Loaded {
    config: Config;
    keymap: Map<string, string>;
    errors: string[];
}

const read = (name: string) => invoke<string | null>("config_read", { name });
const write = (name: string, contents: string) => invoke("config_write", { name, contents });

function parseJsonc<T>(name: string, text: string, errors: string[]): T | undefined {
    const problems: ParseError[] = [];
    const value = parse(text, problems, { allowTrailingComma: true });
    if (problems.length) {
        const p = problems[0];
        const line = text.slice(0, p.offset).split("\n").length;
        errors.push(
            `${name} line ${line}: ${printParseErrorCode(p.error)}. Using the last good values.`,
        );
        return undefined;
    }
    return value as T;
}

let lastGood: { settings?: Record<string, unknown>; keybindings?: Keybinding[] } = {};

/**
 * First run: imports an existing Hyper config if there is one, otherwise
 * writes commented starter files. Schemas are refreshed every start.
 */
export async function ensureConfigFiles(commands: string[]): Promise<string[]> {
    const notes: string[] = [];
    await write("settings.schema.json", JSON.stringify(SETTINGS_SCHEMA, null, 2));
    await write("keybindings.schema.json", JSON.stringify(keybindingsSchema(commands), null, 2));
    if ((await read(SETTINGS)) === null) {
        const imported = await importHyperConfig().catch((e) => {
            notes.push(`Couldn't import your Hyper config: ${e}`);
            return null;
        });
        if (imported) {
            await write(SETTINGS, imported.settings);
            if ((await read(KEYBINDINGS)) === null) await write(KEYBINDINGS, imported.keybindings);
            notes.push(`Imported your Hyper config from ${imported.from}.`, ...imported.notes);
        } else {
            await write(SETTINGS, SETTINGS_TEMPLATE);
        }
    }
    if ((await read(KEYBINDINGS)) === null) await write(KEYBINDINGS, KEYBINDINGS_TEMPLATE);
    return notes;
}

export async function loadConfig(): Promise<Loaded> {
    const errors: string[] = [];

    const settingsText = await read(SETTINGS).catch((e) => {
        errors.push(String(e));
        return null;
    });
    let settings = settingsText
        ? parseJsonc<Record<string, unknown>>(SETTINGS, settingsText, errors)
        : {};
    if (settings === undefined) settings = lastGood.settings ?? {};
    else lastGood.settings = settings;

    const keysText = await read(KEYBINDINGS).catch(() => null);
    let keybindings = keysText ? parseJsonc<Keybinding[]>(KEYBINDINGS, keysText, errors) : [];
    if (keybindings === undefined) keybindings = lastGood.keybindings ?? [];
    else if (!Array.isArray(keybindings)) {
        errors.push(`${KEYBINDINGS} must be a list of { "key", "command" } entries.`);
        keybindings = lastGood.keybindings ?? [];
    } else lastGood.keybindings = keybindings;

    const { $schema: _, ...userConfig } = settings;
    let config: Config = {
        ...DEFAULT_CONFIG,
        ...userConfig,
        colors: { ...DEFAULT_CONFIG.colors, ...(userConfig.colors as object | undefined) },
        modifierKeys: {
            ...DEFAULT_CONFIG.modifierKeys,
            ...(userConfig.modifierKeys as object | undefined),
        },
    } as Config;
    if (!Array.isArray(config.profiles) || !config.profiles.length)
        config.profiles = DEFAULT_CONFIG.profiles;
    if (!config.profiles.some((p) => p.name === config.defaultProfile))
        config.defaultProfile = config.profiles[0].name;

    const themes = Array.isArray(config.themes)
        ? config.themes.filter((t) => typeof t === "string" && t.trim())
        : [];
    if (themes.length) {
        // Some themes only fill in colors the user hasn't set (`config.x || themeX`).
        // Hyper passed its defaults along, so those themes never applied; leave
        // unset colors out so they do.
        const input: Record<string, unknown> = { ...config };
        for (const key of THEME_COLOR_KEYS) if (!(key in userConfig)) delete input[key];
        const themed = await applyThemes(themes, input);
        errors.push(...themed.errors);
        // Themes return a whole config; keep anything they dropped.
        config = {
            ...config,
            ...themed.config,
            colors: { ...config.colors, ...(themed.config.colors as object) },
        } as Config;
    }

    const valid = keybindings.filter(
        (b): b is Keybinding =>
            !!b && typeof b.command === "string" && typeof (b.key ?? "") === "string",
    );
    return {
        config,
        keymap: buildKeymap(valid.map((b) => ({ key: b.key ?? "", command: b.command }))),
        errors,
    };
}
