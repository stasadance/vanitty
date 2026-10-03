import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { focusActive } from "../actions";
import { saveTheme } from "../config/load";
import { themeName } from "../themes";
import { CURATED_THEMES } from "../themes/curated";
import { vanittyThemes } from "../themes/vanitty";
import { notify, setState, useStore } from "../store";

interface Listing {
    name: string;
    description: string;
    downloads: number;
}

type Group = "Vanitty themes" | "Hyper themes" | "More on npm (not reviewed)";

interface Item {
    key: string;
    label: string;
    description: string;
    group?: Group;
    /** What picking it saves. */
    choice: { colorTheme?: string; themes?: string[] };
    current: boolean;
    type?: "light" | "dark";
    downloads?: number;
}

/** Fetched once per run; Rust also keeps it on disk for a day. */
let npmThemes: Promise<Listing[]> | undefined;

function loadNpmThemes() {
    npmThemes ??= invoke<Listing[]>("themes_list").catch((e) => {
        npmThemes = undefined;
        throw e;
    });
    return npmThemes;
}

function close() {
    setState({ themePicker: false });
    focusActive();
}

function shortCount(n: number) {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/**
 * Picks a theme: Vanitty's built-in and your own JSON themes, reviewed Hyper
 * themes pinned to checked versions, then any other Hyper theme on npm.
 */
export function ThemePicker() {
    const config = useStore((s) => s.config);
    const [vanitty, setVanitty] = useState<Item[]>([]);
    const [npm, setNpm] = useState<Listing[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(0);
    const list = useRef<HTMLUListElement>(null);

    const hyperCurrent = new Set(config.themes.map(themeName));

    useEffect(() => {
        void vanittyThemes().then(({ themes }) =>
            setVanitty(
                themes.map((t) => ({
                    key: `vanitty:${t.id}`,
                    label: t.name,
                    description: t.builtin
                        ? `Built in${t.author ? `, by ${t.author}` : ""}`
                        : `Your theme, themes/${t.id}.json`,
                    group: "Vanitty themes",
                    choice: { colorTheme: t.id },
                    current: false,
                    type: t.type,
                })),
            ),
        );
        loadNpmThemes()
            .then(setNpm)
            .catch((e) => setError(`Couldn't load more themes from npm: ${e}`));
    }, []);

    useEffect(() => {
        list.current
            ?.querySelector(`[data-index="${selected}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [selected]);

    const curatedNames = new Set(CURATED_THEMES.map((t) => themeName(t.spec)));
    const all: Item[] = [
        {
            key: "default",
            label: "Default",
            description: "Vanitty's own look",
            choice: {},
            current: !config.colorTheme && hyperCurrent.size === 0,
        },
        ...vanitty.map((t) => ({ ...t, current: t.choice.colorTheme === config.colorTheme })),
        ...CURATED_THEMES.map((t): Item => {
            const name = themeName(t.spec);
            return {
                key: `hyper:${name}`,
                label: name,
                description: t.description,
                group: "Hyper themes",
                choice: { themes: [t.spec] },
                current: hyperCurrent.has(name),
                type: t.type,
            };
        }),
        ...(npm ?? [])
            .filter((t) => !curatedNames.has(t.name))
            .map((t): Item => ({
                key: `npm:${t.name}`,
                label: t.name,
                description: t.description,
                group: "More on npm (not reviewed)",
                choice: { themes: [t.name] },
                current: hyperCurrent.has(t.name),
                downloads: t.downloads,
            })),
    ];
    const q = query.trim().toLowerCase();
    const items = all.filter(
        (t) =>
            !q ||
            t.label.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.type === q,
    );

    const pick = (t: Item) => {
        close();
        saveTheme(t.choice).catch((e) => notify(String(e), true));
    };

    return (
        <div className="theme_picker_backdrop" onMouseDown={close}>
            <div
                className="theme_picker"
                style={{
                    backgroundColor: config.backgroundColor,
                    color: config.foregroundColor,
                    borderColor: config.borderColor,
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <input
                    autoFocus
                    className="theme_picker_input"
                    style={{ borderColor: config.borderColor }}
                    placeholder="Search themes"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelected(0);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            const step = e.key === "ArrowDown" ? 1 : -1;
                            setSelected((i) => Math.max(0, Math.min(items.length - 1, i + step)));
                        } else if (e.key === "Enter") {
                            e.preventDefault();
                            if (items[selected]) pick(items[selected]);
                        } else if (e.key === "Escape") {
                            e.preventDefault();
                            e.stopPropagation();
                            close();
                        }
                    }}
                />
                <ul ref={list} className="theme_picker_list">
                    {items.map((t, i) => (
                        <li key={t.key} className="theme_picker_row">
                            {t.group && t.group !== items[i - 1]?.group && (
                                <div className="theme_picker_group">{t.group}</div>
                            )}
                            <div
                                data-index={i}
                                className="theme_picker_item"
                                style={{
                                    backgroundColor:
                                        i === selected ? config.selectionColor : undefined,
                                }}
                                onMouseMove={() => setSelected(i)}
                                onClick={() => pick(t)}
                            >
                                <span className="theme_picker_name">
                                    {t.label}
                                    {t.current && (
                                        <span className="theme_picker_current"> current</span>
                                    )}
                                </span>
                                {t.type && (
                                    <span className="theme_picker_type">
                                        {t.type === "light" ? "Light" : "Dark"}
                                    </span>
                                )}
                                {!!t.downloads && (
                                    <span className="theme_picker_downloads">
                                        {shortCount(t.downloads)}/mo
                                    </span>
                                )}
                                <span className="theme_picker_description">{t.description}</span>
                            </div>
                        </li>
                    ))}
                </ul>
                {(error || !npm) && (
                    <div className="theme_picker_status">
                        {error ?? "Loading more themes from npm…"}
                    </div>
                )}
            </div>
        </div>
    );
}
