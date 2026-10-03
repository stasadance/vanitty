import { invoke } from "@tauri-apps/api/core";
import { parse, type ParseError } from "jsonc-parser";

/**
 * A Vanitty theme: a JSON file of colors and optional CSS. Unlike Hyper
 * themes it's data, so nothing runs. Only the settings that change how
 * Vanitty looks are taken from it (see `themeChanges`).
 */
export interface VanittyTheme {
    /** File name without `.json`; what `colorTheme` in settings.json names. */
    id: string;
    name: string;
    author?: string;
    /** Shipped with Vanitty, rather than a file in your themes folder. */
    builtin: boolean;
    settings: Record<string, unknown>;
}

const BUILTIN = import.meta.glob<Record<string, unknown>>("./builtin/*.json", {
    eager: true,
    import: "default",
});

function fromData(id: string, data: Record<string, unknown>, builtin: boolean): VanittyTheme {
    return {
        id,
        name: typeof data.name === "string" && data.name ? data.name : id,
        author: typeof data.author === "string" ? data.author : undefined,
        builtin,
        settings: data,
    };
}

/** Built-in themes, then yours from the `themes` folder. Broken files are reported. */
export async function vanittyThemes(): Promise<{ themes: VanittyTheme[]; errors: string[] }> {
    const themes = Object.entries(BUILTIN).map(([path, data]) =>
        fromData(path.replace(/^.*\/|\.json$/g, ""), data, true),
    );
    const errors: string[] = [];
    const local = await invoke<Record<string, string>>("themes_local").catch(() => ({}));
    for (const [id, text] of Object.entries(local)) {
        const problems: ParseError[] = [];
        const data = parse(text, problems, { allowTrailingComma: true });
        if (problems.length || !data || typeof data !== "object" || Array.isArray(data)) {
            errors.push(`themes/${id}.json isn't a valid theme: it must be a JSON object.`);
            continue;
        }
        // Your own theme wins over a built-in one with the same file name.
        const i = themes.findIndex((t) => t.id === id);
        if (i >= 0) themes.splice(i, 1);
        themes.push(fromData(id, data, false));
    }
    return { themes, errors };
}
