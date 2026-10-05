import { invoke } from "@tauri-apps/api/core";
import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from "jsonc-parser";

import {
    type Config,
    DEFAULT_CONFIG,
    KEYBINDINGS_TEMPLATE,
    type Profile,
    SETTINGS_TEMPLATE,
} from "./defaults";
import { importHyperConfig } from "./hyper";
import { buildKeymap, type Keybinding } from "./keymaps";
import { keybindingsSchema, SETTINGS_SCHEMA } from "./schema";

import { applyThemes } from "../themes";
import { vanittyThemes } from "../themes/vanitty";

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

/**
 * The only settings a theme may change: how Vanitty looks. Theme code comes
 * from npm, so it must not set the shell, its arguments, environment or
 * folder, plugins or anything else that runs or loads something.
 */
const THEME_KEYS = new Set([
    ...THEME_COLOR_KEYS,
    "colors",
    "css",
    "termCSS",
    "fontFamily",
    "uiFontFamily",
    "fontSize",
    "fontWeight",
    "fontWeightBold",
    "lineHeight",
    "letterSpacing",
    "padding",
    "cursorShape",
    "cursorBlink",
]);

/** The looks-only part of what themes returned. */
function themeChanges(themed: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(themed).filter(([key]) => THEME_KEYS.has(key)));
}

export interface Loaded {
    config: Config;
    keymap: Map<string, string>;
    errors: string[];
}

const read = (name: string) => invoke<string | null>("config_read", { name });
const write = (name: string, contents: string) => invoke("config_write", { name, contents });

interface DetectedShell {
    name: string;
    shell: string;
    shellArgs: string[];
}

/** Other shells installed on this machine (Windows only), looked up once. */
let detected: Promise<DetectedShell[]> | undefined;

/** Adds detected shells as profiles unless one already has that name or shell. */
async function withDetectedShells(profiles: Profile[]): Promise<Profile[]> {
    detected ??= invoke<DetectedShell[]>("shells_detect").catch(() => []);
    const taken = (s: DetectedShell) =>
        profiles.some(
            (p) =>
                p.name.toLowerCase() === s.name.toLowerCase() ||
                p.config?.shell?.toLowerCase() === s.shell.toLowerCase(),
        );
    const detectedShells = await detected;
    const extra = detectedShells
        .filter((s) => !taken(s))
        .map((s) => ({ name: s.name, config: { shell: s.shell, shellArgs: s.shellArgs } }));
    return [...profiles, ...extra];
}

function parseJsonc<T>(name: string, text: string, errors: string[]): T | undefined {
    const problems: ParseError[] = [];
    const value = parse(text, problems, { allowTrailingComma: true });
    if (problems.length > 0) {
        const p = problems[0];
        const line = text.slice(0, p.offset).split("\n").length;
        errors.push(
            `${name} line ${line}: ${printParseErrorCode(p.error)}. Using the last good values.`,
        );
        return undefined;
    }
    return value as T;
}

const lastGood: { settings?: Record<string, unknown>; keybindings?: Keybinding[] } = {};

/**
 * First run: imports an existing Hyper config if there is one, otherwise
 * writes commented starter files. Schemas are refreshed every start.
 */
export async function ensureConfigFiles(commands: string[]): Promise<string[]> {
    const notes: string[] = [];
    await write("settings.schema.json", JSON.stringify(SETTINGS_SCHEMA, null, 2));
    await write("keybindings.schema.json", JSON.stringify(keybindingsSchema(commands), null, 2));
    if ((await read(SETTINGS)) === null) {
        const imported = await importHyperConfig().catch((error) => {
            notes.push(`Couldn't import your Hyper config: ${error}`);
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

    const settingsText = await read(SETTINGS).catch((error) => {
        errors.push(String(error));
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
    else if (Array.isArray(keybindings)) {
        lastGood.keybindings = keybindings;
    } else {
        errors.push(`${KEYBINDINGS} must be a list of { "key", "command" } entries.`);
        keybindings = lastGood.keybindings ?? [];
    }

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
    if (!Array.isArray(config.profiles) || config.profiles.length === 0)
        config.profiles = DEFAULT_CONFIG.profiles;
    // Before the default check, so defaultProfile can name a detected shell.
    config.profiles = await withDetectedShells(config.profiles);
    if (config.profiles.every((p) => p.name !== config.defaultProfile))
        config.defaultProfile = config.profiles[0].name;

    // A Vanitty theme is plain data: apply its looks before any Hyper themes.
    const themeSet = new Set(Object.keys(userConfig));
    if (typeof config.colorTheme === "string" && config.colorTheme) {
        const found = await vanittyThemes();
        errors.push(...found.errors);
        const theme = found.themes.find((t) => t.id === config.colorTheme);
        if (theme) {
            const looks = themeChanges(theme.settings);
            for (const key of Object.keys(looks)) themeSet.add(key);
            config = {
                ...config,
                ...looks,
                colors: { ...config.colors, ...(looks.colors as object | undefined) },
            } as Config;
        } else {
            errors.push(`Theme "${config.colorTheme}" not found. Pick one with Change Theme….`);
        }
    }

    const themes = Array.isArray(config.themes)
        ? config.themes.filter((t) => typeof t === "string" && t.trim())
        : [];
    if (themes.length > 0) {
        // Some themes only fill in colors the user hasn't set (`config.x || themeX`).
        // Hyper passed its defaults along, so those themes never applied; leave
        // unset colors out so they do.
        const input: Record<string, unknown> = { ...config };
        for (const key of THEME_COLOR_KEYS) if (!themeSet.has(key)) delete input[key];
        const themed = await applyThemes(themes, input);
        errors.push(...themed.errors);
        // Themes return a whole config; keep anything they dropped, and take
        // only the settings that change how things look.
        config = {
            ...config,
            ...themeChanges(themed.config),
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

/**
 * Sets the theme in settings.json, keeping its comments and formatting: a
 * Vanitty theme id in `colorTheme`, or Hyper themes in `themes`. Setting one
 * clears the other, and neither means Vanitty's own look.
 */
export async function saveTheme(choice: { colorTheme?: string; themes?: string[] }) {
    let text = (await read(SETTINGS)) ?? SETTINGS_TEMPLATE;
    const problems: ParseError[] = [];
    parse(text, problems, { allowTrailingComma: true });
    if (problems.length > 0) throw new Error(`Fix ${SETTINGS} first: it has a syntax error.`);
    const formattingOptions = { insertSpaces: true, tabSize: 2 };
    text = applyEdits(
        text,
        modify(text, ["colorTheme"], choice.colorTheme || undefined, { formattingOptions }),
    );
    text = applyEdits(text, modify(text, ["themes"], choice.themes ?? [], { formattingOptions }));
    await write(SETTINGS, text);
}
