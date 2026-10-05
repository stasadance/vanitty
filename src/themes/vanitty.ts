import { invoke } from "@tauri-apps/api/core";
import Color from "color";
import { parse, type ParseError } from "jsonc-parser";

import { orElse } from "../helpers";

/** A JSON theme of colors and CSS. Nothing runs, and only looks apply (`themeChanges`). */
export interface VanittyTheme {
    /** File name without `.json`; what `colorTheme` in settings.json names. */
    id: string;
    name: string;
    /** From the file's `type`, else worked out from its background color. */
    type?: "light" | "dark";
    author?: string;
    /** Shipped with Vanitty, rather than a file in your themes folder. */
    builtin: boolean;
    settings: Record<string, unknown>;
}

const BUILTIN = import.meta.glob<Record<string, unknown>>("./builtin/*.json", {
    eager: true,
    import: "default",
});

function themeType(data: Record<string, unknown>): VanittyTheme["type"] {
    if (data.type === "light" || data.type === "dark") return data.type;
    try {
        return Color(data.backgroundColor as string).isLight() ? "light" : "dark";
    } catch {
        return undefined;
    }
}

function fromData(id: string, data: Record<string, unknown>, isBuiltin: boolean): VanittyTheme {
    return {
        id,
        name: typeof data.name === "string" && data.name ? data.name : id,
        type: themeType(data),
        author: typeof data.author === "string" ? data.author : undefined,
        builtin: isBuiltin,
        settings: data,
    };
}

/** Built-in themes, then yours from the `themes` folder. Broken files are reported. */
export async function vanittyThemes(): Promise<{ themes: VanittyTheme[]; errors: string[] }> {
    const themes = Object.entries(BUILTIN).map(([path, data]) =>
        fromData(path.replaceAll(/^.*\/|\.json$/g, ""), data, true),
    );
    const errors: string[] = [];
    const local = await orElse(invoke<Record<string, string>>("themes_local"), {});
    for (const [id, text] of Object.entries(local)) {
        const problems: ParseError[] = [];
        const data = parse(text, problems, { allowTrailingComma: true });
        if (!data || typeof data !== "object" || Array.isArray(data) || problems.length > 0) {
            errors.push(`themes/${id}.json isn't a valid theme: it must be a JSON object.`);
            continue;
        }
        // Your own theme wins over a built-in one with the same file name.
        const index = themes.findIndex((t) => t.id === id);
        if (index !== -1) themes.splice(index, 1);
        themes.push(fromData(id, data, false));
    }
    return { themes, errors };
}
